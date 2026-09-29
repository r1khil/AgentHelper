"use client";

import { useState } from "react";
import { deleteChat } from "@/lib/actions/chats";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Delete" in a thread's header: asks first, since a deleted thread and its answers are gone for everyone. */
export function DeleteThread({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this thread?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <form action={deleteChat} className="flex justify-end gap-2">
            <input type="hidden" name="id" value={chatId} />
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Delete</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
