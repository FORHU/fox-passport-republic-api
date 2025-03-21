declare namespace Express {
  interface Request {
    user?: any;
    venues?: any;
    roles?: any[];
    tenant?: any;
    file?: Multer.File;
    files?: Multer.File[];
  }
}
