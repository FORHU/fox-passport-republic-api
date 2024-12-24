import UAParser from "ua-parser-js";
const parser = new UAParser();

export const getUAResult = (data: any) => parser.setUA(data).getResult();
