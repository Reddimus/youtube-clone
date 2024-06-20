# YouTube Clone

This repository hosts the source code for a YouTube clone. The core component of this project is the `video-processing-service`, which handles video file processing.

## Project Structure

- **video-processing-service**: A Node.js application utilizing Express.js for HTTP request handling and Fluent FFmpeg for video processing tasks.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

What things you need to install the software and how to install them:

```sh
node --version
npm --version
ffmpeg -version  # Fluent FFmpeg requires FFmpeg to be installed
docker --version
```

### Installation

1. **Clone the repository**:
	 ```sh
	 git clone https://github.com/Reddimus/youtube-clone.git
	 ```

2. **Navigate to the service directory**:
	 ```sh
	 cd video-processing-service
	 ```

3. **Build the Docker image**:
	 ```sh
	 docker build -t video-processing-service .
	 ```

Docker will ensure that the application runs with all necessary dependencies, regardless of the host environment.

### Running the Service

1. **Start the server on port 3000**:
	```sh
	docker run -p 3000:3000 -d video-processing-service
	```
2. **Find the container ID**:
	```sh
	docker ps
	```
3. **Copy a local video file into the docker container**:
	```sh
	docker cp ./video.mp4 <container_id>:/app/video.mp4
	```
4. **POST a request to http://localhost:3000/process-video**:  
	Body (JSON):
	```json
	{
		"inputFilePath": "./video.mp4", 
		"outputFilePath": "./processed-video.mp4"
	}
	```
	> Recommended: Use Thunder Client or Postman to send the request.
5. **Copy our processed video file out of the Docker container**:
	```sh
	docker cp <container_id>:/app/processed-video.mp4 ./
	```

This will start the service on `localhost:3000` by default. You can modify the `PORT` environment variable in your configuration file or directly in your terminal to use a different port.

## API Reference

The service exposes the following endpoint for video processing:

- **POST /process-video**:
	- **Purpose**: Processes a video file.
	- **Request Body**:
		```json
		{
			"inputFilePath": "path/to/input.mp4",
			"outputFilePath": "path/to/output.mp4"
		}
		```
	- **Response**: A status message indicating the success or failure of the video processing.
