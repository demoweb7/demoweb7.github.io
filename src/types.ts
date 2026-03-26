export interface Break {
  checked: boolean;
  time?: string;
  startTime?: number; // timestamp
  endTime?: number; // timestamp
}

export interface Analyst {
  id: string;
  name: string;
  break1: Break;
  break2: Break;
}

export interface ActiveBreak {
  id: string; // Unique ID for the active break session
  analystId: string;
  analystName: string;
  breakName: string;
  startTime: number; // timestamp
}

export const ADMIN_PASSWORD = "Admin#1";
