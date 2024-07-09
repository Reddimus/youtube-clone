# Video Processing Service:

The Video Processing Service is a core component of the YouTube clone project, designed to handle all aspects of video processing with efficiency and scalability. This service is built on a robust tech stack leveraging Node.js and Express.js for server-side logic, Fluent FFmpeg for comprehensive video processing capabilities, and a suite of Google Cloud services for data management and inter-service communication.

## Key Features and Technologies:

- **Node.js and Express.js**: At the heart of the service is Node.js, providing the runtime environment for executing JavaScript on the server side. Express.js, a minimal and flexible Node.js web application framework, is used to handle HTTP requests, making the creation of API endpoints straightforward and efficient.

- **Fluent FFmpeg**: This service utilizes Fluent FFmpeg, a Node.js wrapper for FFmpeg, to perform a wide range of video processing tasks. These include converting video formats, compressing videos, extracting thumbnails, and more, offering high performance and flexibility in video manipulation.

- **TypeScript**: The entire codebase is written in TypeScript, a superset of JavaScript that adds static types. TypeScript's compile-time type checking enhances code quality and maintainability, making the development process more robust and error-free.

- **Google Cloud Services**:
  - **Google Cloud Storage**: For robust and scalable file storage, the service leverages Google Cloud Storage. It provides a secure and efficient way to store raw and processed videos, ensuring high availability and global access.
  - **Google Cloud Pub/Sub**: To facilitate reliable inter-service messaging, Google Cloud Pub/Sub is used. This allows for decoupled communication between services, enabling scalable and maintainable architectures.
  - **Firestore and Firebase Authentication**: For storing user data and managing user authentication, Firestore and Firebase Authentication are integrated. These services provide a comprehensive solution for data storage and secure user authentication.

- **Docker and Google Cloud Run**: The service is containerized using Docker, ensuring consistency across development, testing, and production environments. Deployment is handled through Google Cloud Run, which offers a fully managed platform for running containerized applications. This setup guarantees a scalable and isolated environment, capable of handling the demands of video processing tasks with ease.

- **Development Tools**:
  - **Docker**: Used for creating containerized versions of the service, making it easy to deploy and scale across any environment.
  - **npm**: As the package manager for Node.js, npm is used to manage the project's dependencies.
  - **TypeScript Compiler (tsc)**: Converts TypeScript code into JavaScript, ensuring compatibility with the Node.js runtime.
  - **ts-node**: A tool for executing TypeScript directly, used during development for running scripts.

This Video Processing Service is designed with scalability, performance, and reliability in mind, utilizing the latest in web technologies and cloud infrastructure to provide a seamless video processing experience.

## Setup guide:

### Prerequisites:
1. **Make sure you are in the `video-processing-service` directory**:
    ```bash
    cd video-processing-service
    ```
2. **Install Node.js (20) and npm dependencies**:
    ```bash
    npm install
    ```

### Create a Google account and Firebase/Google cloud account
1. Sign into [Firebase](https://firebase.google.com/) and click go to the `Console`. You can view your Firebase projects here. If you don't have access to this `YouTube Clone` project, you request access from the project owner.
2. Sign into [Google Cloud](https://cloud.google.com/). Go to the `Cloud Console`. You can view your Google Cloud projects here. If you don't have access to this `YouTube Clone` project, you request access from the project owner.

### Install `gcloud` and `gsutil` CLI tools.
1. Follow the instructions [here](https://cloud.google.com/sdk/docs/install).
2. Then Make sure to authentication with your account and set your project:
    ```bash
    gcloud auth login # Copy the output url and paste it into your browser

    gcloud config set project <PROJECT_ID>
    ```

### (Optional) Update gcloud components
```bash
gcloud components update
```

That's it! You have successfully set up the video processing service folder for development.

## Build and push Docker image to Google Artifact Registry

1. **Build the Docker image**:
    ```bash
    docker build -t us-central1-docker.pkg.dev/<PROJECT_ID>/yt-web-client-repo/yt-web-client .
    ```
2. **Push the Docker image to Google Artifact Registry**:
    ```bash
    docker push us-central1-docker.pkg.dev/<PROJECT_ID>/yt-web-client-repo/yt-web-client
    ```
3. **Deploy the Docker image to Google Cloud Run**:
    ```bash
    # Deploy container to cloud run
    gcloud run deploy yt-web-client --image us-central1-docker.pkg.dev/<PROJECT_ID>/yt-web-client-repo/yt-web-client \
    --region=us-central1 \
    --platform managed \
    --timeout=3600 \
    --memory=2Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=1
    ```