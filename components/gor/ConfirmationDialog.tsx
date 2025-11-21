import React from 'react';
import { GoreanButton, GoreanColors, GoreanFonts } from './GoreanTheme';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div
        className="rounded-lg shadow-2xl max-w-md w-full mx-4 p-6"
        style={{
          backgroundColor: GoreanColors.parchment,
          border: `3px solid ${GoreanColors.leather}`,
          fontFamily: GoreanFonts.body
        }}
      >
        {/* Title */}
        <h3
          className="text-xl font-bold mb-4"
          style={{
            color: GoreanColors.charcoal,
            fontFamily: GoreanFonts.heading
          }}
        >
          {title}
        </h3>

        {/* Message */}
        <p
          className="mb-6"
          style={{ color: GoreanColors.charcoal }}
        >
          {message}
        </p>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <GoreanButton
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </GoreanButton>
          <GoreanButton
            variant="danger"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </GoreanButton>
        </div>
      </div>
    </div>
  );
}
