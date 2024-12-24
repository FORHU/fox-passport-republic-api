import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

const PROTO_PATH = path.join(__dirname, "queue.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {});
const queueProto = grpc.loadPackageDefinition(packageDefinition) as any;

const client = new queueProto.queue.QueueService("localhost:50051", grpc.credentials.createInsecure());

export const enqueueJob = (jobType: string, jobData: string) => {
  return new Promise<any>((resolve, reject) => {
    client.EnqueueJob({ jobType, jobData }, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error enqueuing job:", error.message);
        reject(error);
      } else {
        console.log(response);
        resolve(response);
      }
    });
  });
};
