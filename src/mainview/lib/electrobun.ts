import { Electroview } from "electrobun/view";
import type { NotesRPC } from "shared/rpc";

const rpc = Electroview.defineRPC<NotesRPC>({
  maxRequestTime: 30000,
  handlers: { requests: {}, messages: {} },
});

export const electrobun = new Electroview({ rpc });
