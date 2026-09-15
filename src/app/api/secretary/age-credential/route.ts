import type { NextRequest } from "next/server";
import {
  handleIssueAgeCredential,
  handleReadAgeCredential,
} from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const GET = async (request: NextRequest): Promise<Response> => {
  return handleReadAgeCredential(request, secretaryRouteDeps);
};

export const POST = async (request: NextRequest): Promise<Response> => {
  return handleIssueAgeCredential(request, secretaryRouteDeps);
};
