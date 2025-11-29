# Kirkify.me

This is the worst website to ever exist. I'm turning it off the second I can.

## Build Instructions

There are two ways you can build this: In a docker container and directly. I highly recommend just running it in a docker container becuase there's no reason why you would want to run this without containerization. 

### Docker Container (Recommended)

```
docker build -t kirkify.me .
```

It also comes with a docker compose file if you want to use that.

```
docker compose up -d --build
```

And you're done. I should note that on the compose file that it hosts on port 37910. If you want to change this, change the docker compose file.

### Direct Build

Okay you have to have Python AND Nodejs installed. 

```
apt install python3 python3-pip nodejs npm
```

Then install the requirements for both the Python script and the Nodejs script.

```
pip3 install -r requirements.txt
npm install
```

Now download both of the models

```
curl -o "inswapper_128.onnx" https://bk4vz20t6s.ufs.sh/f/5eVwDsd8R3jL5kumGF8R3jLVwUJfdOu8cQ4ymMqAFeW7zrEX
python3 kirkifier.py init
```

Finally, run it.

```
npm start
```