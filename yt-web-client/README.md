# Web Client

This is the web client for a YouTube clone project. It's built using Next.js and integrates with Firebase for backend services.

## Key Features and Technologies:

- **Next.js**: Utilizes the latest features of Next.js for server-side rendering and static site generation.
- **Firebase Integration**: Uses Firebase for authentication, database, and hosting services.
- **Responsive Design**: Ensures a smooth user experience across various devices and screen sizes.

## Setup guide:

### Prerequisites

Before you begin, ensure you have `node.js` (>=18) and `npm` installed on your machine.

1. **Navigate to the web client directory**:
   ```sh
    cd yt-web-client
    ```
2. **Install dependencies**:
    ```sh
    npm install
    ```

### Add Firebase SDK with Auth Handlers

#### Create a Firebase Web App

Navigate to https://console.firebase.google.com/ and within the project you previously created.

Click the Gear icon next to `Project Overview` and click `Project Settings`.

Navigate to the bottom of the page, and in the `Your apps` section. Click the `</>` button, which will create a new firebase web app for our project.

> Alternatively, we could've created an ios or android app, but we will be using the web app.

Enter a name for the app, and click `Register app`.

You will be presented with a snippet of code that contains the `Firebase SDK configuration` including API key(s); we will use this `Firebase SDK configuration` in our Next.js app.

#### Add Firebase SDK to our Next.js App

Implement the `Firebase SDK configuration` snippet into `firebase.ts` inside the `/app/firebase` directory.

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

Optional: Or instead, you can create a `.env.local` file in the root directory of the project and add the following environment variables to keep the sensitive information private.

```sh
NEXT_PUBLIC_FIREBASE_API_KEY=<YOUR_FIREBASE_API_KEY>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<YOUR_FIREBASE_AUTH_DOMAIN>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<YOUR_FIREBASE_PROJECT_ID>
NEXT_PUBLIC_FIREBASE_APP_ID=<YOUR_FIREBASE_APP_ID>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<YOUR_FIREBASE_MEASUREMENT_ID>
```

### Add Sign In With Google

#### Enable Google Sign-In in Firebase

1. Navigate to the [Firebase](https://firebase.google.com/) console.
2. Click on the project you created earlier.
3. Navigate to the `Authentication` tab.
4. Click on the `Sign-in method` tab.
5. Enable the `Google` sign-in provider.

That's it! Now you can test the sign-in button in the web client.

## Testing the Video Processing Service

### Running the Web Client

Run the app with `npm run dev` and test the sign in button.

After signing in with your google account, navigate to the firebase console: https://console.firebase.google.com/

Click on the project you created, and navigate to the `Authentication` tab. It may be under the `Build` category.

You should see your google account listed under `Users`.
