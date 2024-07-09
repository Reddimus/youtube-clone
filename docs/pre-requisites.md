# Prerequisites

Basic programming familiarity is assumed, e.g. I won't be explaining what a loop or function is, but I will explain the purpose of complex code and commands.

We will be using `TypeScript`.

The following are steps I recommend taking.

## 1. (Optional) Install Visual Studio Code
Alternatively, you can use any text editor you like. If you're not sure which to choose, I recommend VSCode as it is what I developed with.

https://code.visualstudio.com/download

## 2. Have a GitHub account

This repository will be hosted on GitHub, and we will be using it for version control.

https://github.com/new

## 3. (Optional) Install WSL2
If you are using Windows, I recommend installing WSL2. This will allow you to run a nearly complete Linux operating system.

It's generally easier to develop on Linux than Windows, and WSL2 makes it easy to do so without having to dual boot or use a virtual machine.

This is especially the case for Docker, which we will use.

I will be using Ubuntu 22.04.3 LTS within WSL2, but you can use any Linux distribution you like.

> Note: If you are using macOS or Linux, you can skip this step. If you decide to use WSL2, make sure to complete the next steps within WSL and not on Windows. This also goes for all future install steps referenced in this repository.

https://learn.microsoft.com/en-us/windows/wsl/install

## 4. Install Node.js (20) and npm
A. Via installer: https://nodejs.org/en/download

B. Via package manager:
https://nodejs.org/en/download/package-manager

## 5. Install Docker
https://docs.docker.com/engine/install/

I personally installed it via the CLI:

```sh
sudo apt install podman-docker  # version 3.4.4+ds1-1ubuntu1.22.04.1
```

## 6. Have a Firebase account
We will be using Firebase for authentication, database, and hosting services.

https://firebase.google.com

Install the Firebase CLI globally:

```sh
npm install -g firebase-tools
```

## 7. Have a Google Cloud account

We will be using Google Cloud for the Video Intelligence API.

https://cloud.google.com
