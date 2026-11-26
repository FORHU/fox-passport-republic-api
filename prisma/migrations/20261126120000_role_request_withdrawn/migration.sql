-- AlterEnum: an applicant can withdraw their own open role application (api#367)
ALTER TYPE "RequestStatus" ADD VALUE 'withdrawn';
