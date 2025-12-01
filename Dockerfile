FROM node:20-slim

# Install Python, pip, curl, and some other dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Allow pip to install packages globally (screw you ubuntu)
ENV PIP_BREAK_SYSTEM_PACKAGES=1

COPY . .

# Install requirements
RUN pip3 install -r requirements.txt

RUN npm install

# --- PRELOAD INSIGHTFACE MODELS ---
ENV INSIGHTFACE_HOME=/app/.insightface
ENV MPLCONFIGDIR=/app/matplotlib
RUN mkdir -p /app/matplotlib /app/.insightface && \
    python3 - << 'EOF'
import os
os.environ["INSIGHTFACE_HOME"] = "/app/.insightface"
from insightface.app import FaceAnalysis
fa = FaceAnalysis(name="buffalo_l", root="/app/.insightface")
fa.prepare(ctx_id=0, det_size=(640, 640))
print(">>> PRELOADED buffalo_l SUCCESSFULLY <<<")
EOF
# -----------------------------------

# Download a copy of inswapper_128.onnx (too big to include in repo)
RUN curl -o "inswapper_128.onnx" https://bk4vz20t6s.ufs.sh/f/5eVwDsd8R3jL5kumGF8R3jLVwUJfdOu8cQ4ymMqAFeW7zrEX

# Download buffalo_l
RUN python3 kirkifier.py init

ENV GENERIC_ERROR_MESSAGE="KIRKIFICATION FAILED. The system determined you are a bad person."
ENV NO_FACES_DETECTED_ERROR_MESSAGE="No faces detected in the image. Try a different photo."
ENV PORT=3000


EXPOSE 3000

CMD ["npm", "start"]
