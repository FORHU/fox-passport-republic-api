declare namespace Express {
    interface Request {
        user?: any;
        file?: Express.Multer.File;
    }
}
