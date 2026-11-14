import type { StatusTone } from "./status-badge";

export interface ToastInput {
  tone: StatusTone;
  title: string;
  description?: string;
}

export interface ToastItemView extends ToastInput {
  id: number;
}
