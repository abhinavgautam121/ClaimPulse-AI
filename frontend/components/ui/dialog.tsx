"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="modal-overlay" />
        <D.Content className={"modal-content " + (wide ? "wide" : "")}>
          <div className="modal-heading">
            <div>
              <D.Title>{title}</D.Title>
              <D.Description>
                {description || "Manage synthetic workspace records."}
              </D.Description>
            </div>
            <D.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
