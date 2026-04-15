import { prisma } from "../utils/prisma";

export default class FileRepo {
    static async createFile(data: {
        url: string;
        name: string;
        type: string;
    }) {
        return prisma.file.create({ data: {
            url: data.url,
            name: data.name,
            type: data.type,
        } });
    }
}