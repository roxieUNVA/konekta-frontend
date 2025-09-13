export interface User {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  uuid?: string; // identificador principal en backend
}

export type createUserDto = Omit<User, "_id" | "createdAt" | "uuid">;
export type partialUserDto = Partial<User>;

