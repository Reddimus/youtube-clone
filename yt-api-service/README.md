# YouTube Clone - API Service

## Introduction

This directory contains the API service for the YouTube clone project. The API service is built using Firebase Functions and handles various backend operations such as user authentication, video uploads, and video processing.

This directory is the source code for the API service and the highlight of this section is the `createUser` located in the `functions/src/index.ts` file. If you would like to replicate this function in your own project, follow the guide below.

## Key Features and Technologies

- **Firebase Functions**: Serverless functions to handle backend logic.
- **Firebase Auth**: Authentication service to manage user sign-in and sign-out.
- **Firebase Firestore**: NoSQL database to store user and video metadata.

## Create User Firebase Function Guide

### 1. Install Firebase CLI
```sh
npm install -g firebase-tools
```

Authenticate with your Google account:

```sh
firebase login
```

### 2. Install packages

Make sure you are in the `yt-api-service` directory.

```sh
cd yt-api-service
```

Then navigate to the `functions` directory.

```sh
cd functions
```

Open the `package.json` file. Ensure that the node version is set to 20.

```json
"engines": {
  "node": "20"
},
```

Now we will install the necessary packages for our firebase functions project.

```sh
cd functions
```

```sh
npm install
```

Our firebase functions project will be in the `functions` directory. In this case it's a bit redundant to have an outer directory (`yt-api-service`) but I wanted the naming to be clear. And typically firebase functions projects are within a `functions` directory.

Install the firebase functions package, as well as the admin sdk.

```sh
npm install firebase-functions@latest firebase-admin@latest
```

The admin SDK is used to access firebase services from privileged environments (like a server). We will use it to access the firestore database.

## Test with Firebase Emulator

Build firebase functions and run the emulator.

```sh
npm run serve
```

This will start the firebase emulator suite. It will start a local instance of the firebase services that we can use for development. We can define other resources like firestore and firebase auth inside the `firebase.json` file, which can also be emulated. But for now we will keep things simple.

Navigate to `http://localhost:4000` to see the firebase emulator UI.

It is similar to the Firebase console UI, but it is only for local development. It will not affect your actual Firebase project.

Navigate to function logs and you should find a url that you can paste into your browser to test functions.

### Deploy Firebase Functions

(Optional): Before deploying you may need to rerun npm install in the functions directory. For some reason I had errors when deploying without doing this.

```sh
npm install
```

If you still have errors, I recommend deleting your `node_modules` directory and rerunning `npm install`. If you still have errors and you are running Ubuntu WSL mount, you may want to move this project to a non-mounted directory as firebase deploy has a set timeout and the mount may be causing the timeout.

And then you can deploy the functions.

```sh
npm run deploy
```

That's it! We can view deployed functions in the `Firebase console -> Functions` and `Google Cloud Console -> Cloud Functions`.

## References

1. Firebase CLI - https://firebase.google.com/docs/functions/get-started?authuser=0&gen=2nd#set-up-your-environment-and-the-firebase-cli
2. Firebase Emulator - https://firebase.google.com/docs/functions/get-started?authuser=0&gen=2nd#emulate-execution-of-your-functions
3. Firebase Admin SDK - https://firebase.google.com/docs/admin/setup