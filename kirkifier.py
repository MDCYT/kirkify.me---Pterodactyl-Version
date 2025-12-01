import sys
import os
import json
from os import devnull
from cv2 import imread, imwrite
from pathlib import Path
from random import randint
from contextlib import contextmanager

import insightface
from insightface.app import FaceAnalysis

# This became necessary when I started using stdin and stdout to communicate with the node process
@contextmanager
def suppress_output():
    with open(os.devnull, 'w') as devnull:
        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = devnull, devnull
        try:
            yield
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr

def initialize_faceanalysis_and_swapper():
    import os
    
    root = os.environ.get("INSIGHTFACE_HOME", "/app/.insightface")
    os.makedirs(root, exist_ok=True)

    faceanalysis = FaceAnalysis(
        name="buffalo_l",
        root=root
    )
    faceanalysis.prepare(ctx_id=0, det_size=(640, 640))

    swapper = insightface.model_zoo.get_model(
        'inswapper_128.onnx',
        download=False,
        download_zip=False,
        root=root
    )

    return faceanalysis, swapper




# This is where the magic happens
def kirkify(target_image_path: str, output_path: str, faceanalysis: FaceAnalysis, swapper: insightface.model_zoo.model_zoo.INSwapper):
    
    # Read in the target image
    img = imread(target_image_path)
    # Detect all the faces
    faces = faceanalysis.get(img)
    if len(faces) == 0:
        raise ValueError('NO_FACES_DETECTED')
    
    # Read in one of 3 kirk files and get the face (this can probably be optimized by just storing the face data)
    kirk = imread(f'kirks/kirk_{randint(0, 2)}.jpg')
    kirk_face = faceanalysis.get(kirk)[0]

    # Create a copy of the target image in memory
    res = img.copy()

    # For every face in the image, replace the copy of the target image with a new version where that face has been swapped with kirks
    for face in faces:
        res = swapper.get(res, face, kirk_face, paste_back=True)

    # Write the resulting image to the output path
    imwrite(output_path, res)

def main():
    
    # Initialize the two ML models
    with suppress_output():
        faceanalysis, swapper = initialize_faceanalysis_and_swapper()

    # On first run, the face swapper will download buffalo_l so if this is running with the "init" flag, we can just stop here because this script will be run again when the rest of the site starts up
    if len(sys.argv) > 1 and sys.argv[1] == "init":
        print("initialized!!")
        exit()

    while True:
        
        # When you recieve a new input on stdin, store it
        line = sys.stdin.readline()
        if not line:
            break
        
        # Had to initialize this out here just in case of an edge case where request_id is never specified
        request_id = None
        try:
            
            # Get data from stdin
            data = json.loads(line.strip())
            request_id = data.get('request_id')  
            TARGET_PATH = data['target_path']
            OUTPUT_PATH = data['output_path']

            if not Path(TARGET_PATH).exists():  
                print(json.dumps({"error": "target path not real", "request_id": request_id}))
                sys.stdout.flush()
                continue
            
            # Pass the values into the kirkify function
            kirkify(TARGET_PATH, OUTPUT_PATH, faceanalysis, swapper)
            
            # Return the status
            print(json.dumps({"status": "ok", "request_id": request_id}))
            sys.stdout.flush()
            
        except Exception as e:
            print(json.dumps({"error": str(e), "request_id": request_id}), file=sys.stderr)
            sys.stdout.flush()

if __name__ == "__main__":
    main()
