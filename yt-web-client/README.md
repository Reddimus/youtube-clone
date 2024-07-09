# Web Client

This is the web client part of the YouTube Clone project. It leverages Next.js for the frontend and integrates with Firebase for authentication, database, and hosting services. The goal is to replicate core functionalities of YouTube, focusing on video uploads and viewing, with a simplified design approach for learning purposes.

## Key Features and Technologies:

- **Next.js**: Utilizes the latest features of Next.js for server-side rendering and static site generation.
- **Firebase Integration**: Uses Firebase for authentication, database, and hosting services.
- **Responsive Design**: Ensures a smooth user experience across various devices and screen sizes.

## Setup guide:

### Prerequisites

Before you begin, ensure you have `node.js` (20) and `npm` installed on your machine. Also make sure you are an authorized user of the Firebase project.

1. **Navigate to the web client directory**:
   ```sh
    cd yt-web-client
    ```
2. **Install dependencies**:
    ```sh
    npm install
    ```

### Add Firebase SDK with Auth Handlers

#### Add Firebase SDK to our Next.js App

Implement the `Firebase SDK configuration` snippet into `firebase.ts` inside the `/app/firebase` directory. We can find the firebase configuration in the Firebase console under the project settings->General->Your apps->Firebase SDK snippet.

```ts
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: <YOUR_FIREBASE_API_KEY>,
  authDomain: <YOUR_FIREBASE_AUTH_DOMAIN>,
  projectId: <YOUR_FIREBASE_PROJECT_ID>,
  appId: <YOUR_FIREBASE_APP_ID>,
  measurementId: <YOUR_FIREBASE_MEASUREMENT_ID>
};
```

> Note: The following code is a template. Replace the placeholders with your Firebase project's configuration. API keys and other sensitive information should be kept secret.

> Note: If you already have a Firebase project, you can find the `Firebase SDK configuration` in the Firebase console under `Project Overview` > `Project Settings` > `Your apps` > `Firebase SDK snippet`.

Optional: Or instead, you can create a `.env.local` file in the root directory of the project and add the following environment variables to keep the sensitive information private.

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=<YOUR_FIREBASE_API_KEY>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<YOUR_FIREBASE_AUTH_DOMAIN>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<YOUR_FIREBASE_PROJECT_ID>
NEXT_PUBLIC_FIREBASE_APP_ID=<YOUR_FIREBASE_APP_ID>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<YOUR_FIREBASE_MEASUREMENT_ID>
```

That's it! Now you can test the sign-in button in the web client.

## Testing the Video Processing Service

### Running the Web Client

To run the web client, execute the following command:

```sh
npm run dev
```

