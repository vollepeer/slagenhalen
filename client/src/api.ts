import { handleGet, handleSend } from "./localApi";

export async function apiGet<T>(path: string) {
  try {
    return (await handleGet(path)) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function apiSend<T>(path: string, method: string, body?: unknown) {
  try {
    return (await handleSend(path, method, body)) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw error;
  }
}
