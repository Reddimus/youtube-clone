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
1. **Navigate to the video-processing-service directory**:
    ```bash
    cd video-processing-service
    ```
2. **Install dependencies**:
    ```bash
    npm install
    ```

### Host Video Processing Service on Google Cloud Run:
#### Create a Google account and create Firebase/Google cloud project.
1. Sign into [Firebase](https://firebase.google.com/) and click go to the `Console`. Then create a new project which will also create a Google Cloud project. Take note of the `project-id` as you will need it later.
2. Sign into [Google Cloud](https://cloud.google.com/). Go to the `Cloud Console` and select the project you created in Firebase to check if the Google Cloud project was created properly.

#### Install `gcloud` and `gsutil` CLI tools.
1. Follow the instructions [here](https://cloud.google.com/sdk/docs/install).
2. Then Make sure to authentication with your account and set your project:
    ```bash
    gcloud auth login # Copy the output url and paste it into your browser

    gcloud config set project <PROJECT_ID>
    ```

#### Upload the Docker image to Google Artifact Registry
1. Enable artifact registry
    ```bash
    gcloud services enable artifactregistry.googleapis.com
    ```
2. (Optional) Update gcloud components
    ```bash
    gcloud components update
    ```
3. Create an Artifact Registry repository
    ```bash
    gcloud artifacts repositories create video-processing-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for video processing service"
    ```
4. Then, rebuild your Docker image. With this naming scheme, docker knows where to push the image and which project.
    ```bash
    docker build -t us-central1-docker.pkg.dev/<PROJECT_ID>/video-processing-repo/video-processing-service .
    ```
> Important: If you are using mac, add --platform linux/amd64 to the above command.
5. You may still need to configure Docker to use gcloud as the credential helper:
    ```bash
    gcloud auth configure-docker us-central1-docker.pkg.dev
    ```
6. Then, push the Docker image to Google Artifact Registry:
    ```bash
    docker push us-central1-docker.pkg.dev/<PROJECT_ID>/video-processing-repo/video-processing-service
    ```

#### Deploy our Docker image to Google Cloud Run
- Deploy to Google Cloud Run
    ```bash
    # Enable cloud run
    gcloud services enable run.googleapis.com

    # Deploy container to cloud run
    gcloud run deploy video-processing-service --image us-central1-docker.pkg.dev/PROJECT_ID/video-processing-repo/video-processing-service \
    --region=us-central1 \
    --platform managed \
    --timeout=3600 \
    --memory=2Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=1 \
    --ingress=internal
    ```
- We are setting the ingress to internal so that only GCP internal services can access it. This is so that our Pub/Sub service can invoke it, but not the outside world.

- In addition, it might be good to use the `-—no-allow-unauthenticated` flag to limit other internal services. Meaning we can set it up so that only our Pub/Sub service can invoke it and not our other GCP internal services. But this would be cumbersome to setup, so we will skip it for now.

### Create Pub/Sub Topic and Subscription:

#### Create Pub/Sub topic

```bash
gcloud pubsub topics create <TOPIC_NAME>
```

#### Create Pub/Sub subscription

Using the endpoint URL of the video processing service from Cloud Run, create a Pub/Sub subscription.

```bash
gcloud pubsub subscriptions create SUBSCRIPTION_NAME \
  --topic=TOPIC_NAME \
  --push-endpoint=SERVICE_URL \
  --ack-deadline=600
```

>> You can also do this in the Google Cloud Console: https://console.cloud.google.com/cloudpubsub/topicList

### Create Cloud Storage buckets

#### Create raw videos bucket

```bash
# Create raw videos bucket
gsutil mb -l us-central1 --pap=enforced gs://<BUCKET_NAME>

# Configure bucket to send file upload notifications to Pub/Sub topic
gsutil notification create -t <topic-name> -f json -e OBJECT_FINALIZE gs://<BUCKET_NAME>
```

Make sure to use the same topic name that you created in the previous lesson.

#### Create processed videos bucket

```bash
# Create processed videos bucket
gsutil mb -l us-central1 gs://<BUCKET_NAME>
```


## Testing the Video Processing Service

We can now finally test our video processing service. We will upload a video to the raw videos bucket and see if the video processing service processes it.

1. Upload a video to the raw videos bucket on [Google Cloud Storage](https://console.cloud.google.com).

2. Check the logs of the video processing service on [Google Cloud Run](https://console.cloud.google.com/run).

3. Check the processed videos bucket on [Google Cloud Storage](https://console.cloud.google.com).

That's it! You have successfully deployed the video processing service to Google Cloud Run and tested it.