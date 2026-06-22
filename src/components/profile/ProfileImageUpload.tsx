// components/profile/ProfileImageUpload.tsx
'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, X } from 'lucide-react';
import { UserProfile } from '@/lib/types/profile';

interface ProfileImageUploadProps {
  passportPhoto?: string | null;
  idCardPath?: string | null;
  onUploaded: (data: UserProfile) => void;
  onCancel: () => void;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — Vercel serverless body limit is ~4.5MB

export function ProfileImageUpload({
  passportPhoto,
  idCardPath,
  onUploaded,
  onCancel,
}: ProfileImageUploadProps) {
  const { toast } = useToast();
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const validate = (file: File, allowPdf: boolean): string | null => {
    const types = allowPdf
      ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      : ['image/jpeg', 'image/png', 'image/webp'];
    if (!types.includes(file.type)) {
      return `Unsupported file type${allowPdf ? ' (use JPEG, PNG, WebP, or PDF)' : ' (use JPEG, PNG, or WebP)'}`;
    }
    if (file.size > MAX_FILE_SIZE) return 'File must be under 4MB';
    return null;
  };

  const handlePassportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const err = validate(file, false);
      if (err) {
        toast({ title: 'Invalid photo', description: err, variant: 'destructive' });
        e.target.value = '';
        return;
      }
    }
    setPassportFile(file);
    setPassportPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const err = validate(file, true);
      if (err) {
        toast({ title: 'Invalid file', description: err, variant: 'destructive' });
        e.target.value = '';
        return;
      }
    }
    setIdCardFile(file);
    setIdCardPreview(
      file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    );
  };

  const handleSubmit = async () => {
    if (!passportFile && !idCardFile) {
      toast({
        title: 'Nothing to upload',
        description: 'Select at least one file first.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: upload files, get back Cloudinary URLs.
      // NOTE the field names your /api/upload route expects: `id_card` and `passport_photo`.
      const uploadForm = new FormData();
      if (passportFile) uploadForm.append('passport_photo', passportFile);
      if (idCardFile) uploadForm.append('id_card', idCardFile);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: uploadForm, // no Content-Type header — browser sets the multipart boundary
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'File upload failed');
      }

      const { id_card_path, passport_photo_path } = await uploadRes.json();

      // Step 2: persist the URLs. Only send fields that actually came back
      // (the upload route returns '' for files that weren't sent — don't blank existing values).
      const savePayload: { passport_photo?: string; id_card_path?: string } = {};
      if (passport_photo_path) savePayload.passport_photo = passport_photo_path;
      if (id_card_path) savePayload.id_card_path = id_card_path;

      const saveRes = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(savePayload),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        throw new Error(err.error || 'Failed to save images');
      }

      const result = await saveRes.json();
      onUploaded(result.data);
      toast({ title: 'Success', description: 'Images updated successfully' });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to upload images',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border rounded-lg p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Update Photos & Documents</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Passport photo */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Passport Photo</label>
          <div className="flex items-center gap-4">
            <img
              src={passportPreview || passportPhoto || ''}
              alt="Passport preview"
              className="h-24 w-24 rounded-full object-cover border bg-gray-100"
            />
            <div>
              <input
                id="passport-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePassportChange}
              />
              <label htmlFor="passport-input">
                <Button variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose photo
                  </span>
                </Button>
              </label>
              {passportFile && (
                <p className="text-xs text-gray-500 mt-1 truncate max-w-[160px]">
                  {passportFile.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ID card / passport document */}
        <div className="space-y-3">
          <label className="text-sm font-medium">ID Card / Passport Document</label>
          <div className="flex items-center gap-4">
            {idCardPreview ? (
              <img
                src={idCardPreview}
                alt="ID preview"
                className="h-24 w-24 rounded object-cover border bg-gray-100"
              />
            ) : (
              <div className="h-24 w-24 rounded border bg-gray-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div>
              <input
                id="idcard-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleIdCardChange}
              />
              <label htmlFor="idcard-input">
                <Button variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose file
                  </span>
                </Button>
              </label>
              {idCardFile && (
                <p className="text-xs text-gray-500 mt-1 truncate max-w-[160px]">
                  {idCardFile.name}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Accepted: JPEG, PNG, WebP (and PDF for the ID document). Max 4MB each.
      </p>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Save Images'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isUploading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}