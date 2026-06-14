import type { RPCSchema } from "electrobun";

export type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

export type NotesRPC = {
  bun: RPCSchema<{
    requests: {
      getNotes: {
        params: Record<string, never>;
        response: Note[];
      };
      getNote: {
        params: { id: string };
        response: Note | null;
      };
      saveNote: {
        params: { id?: string; title: string; content: string };
        response: { success: boolean; note: Note };
      };
      deleteNote: {
        params: { id: string };
        response: { success: boolean };
      };
      exportNote: {
        params: { id: string };
        response: { success: boolean; path?: string };
      };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
};
