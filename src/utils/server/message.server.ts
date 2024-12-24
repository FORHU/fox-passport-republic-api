import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const PROTO_PATH = "./message.proto";

// Load the proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const messageProto = protoDescriptor.MessageService;

// Implement the SendMessage function
const sendMessage = (call, callback) => {
  const { message } = call.request;
  console.log(`Received message: ${message}`);
  callback(null, { confirmation: "Message received" });
};

// Create the gRPC server
const server = new grpc.Server();
server.addService(messageProto.service, { SendMessage: sendMessage });

server.bindAsync("0.0.0.0:50051", grpc.ServerCredentials.createInsecure(), () => {
  console.log("Server is running on port 50051");
  server.start();
});
