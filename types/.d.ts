declare namespace Express {
    interface Request {
        user?: import("../src/types/auth").AuthenticatedUser;
        file?: Express.Multer.File;
    }
}
