import { supabaseAdmin } from '@/lib/supabaseServer';

const TEMP_BUCKET = 'reader-recordings';
const PDF_PREFIX = 'sides';

/**
 * Upload the given PDF file to Supabase Storage and return a public URL
 * that Mistral can fetch, along with the storage path for later cleanup.
 */
export async function uploadToStorageAndGetUrl(file: File): Promise<{ url: string; path: string }> {
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const ext = 'pdf';
	const safeName = (file.name || 'sides.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
	const timestamp = Date.now();
	const path = `${PDF_PREFIX}/${timestamp}-${safeName}.${ext}`;

	const { error: uploadError } = await supabaseAdmin.storage.from(TEMP_BUCKET).upload(path, buffer, {
		contentType: file.type || 'application/pdf',
		upsert: true
	});

	if (uploadError) {
		console.error('Supabase storage upload error (sides PDF):', uploadError);
		throw new Error(uploadError.message ?? 'Failed to upload PDF to Supabase Storage');
	}

	const {
		data: { publicUrl }
	} = supabaseAdmin.storage.from(TEMP_BUCKET).getPublicUrl(path);

	return { url: publicUrl, path };
}

/**
 * Delete a file from the reader-recordings bucket.
 */
export async function deleteFromTempStorage(path: string): Promise<void> {
	const { error } = await supabaseAdmin.storage.from(TEMP_BUCKET).remove([path]);
	if (error) {
		console.error('Failed to delete from temp storage:', { path, error });
	}
}

/**
 * Delete multiple files from the reader-recordings bucket.
 */
export async function deleteMultipleFromTempStorage(paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	const { error } = await supabaseAdmin.storage.from(TEMP_BUCKET).remove(paths);
	if (error) {
		console.error('Failed to delete files from temp storage:', { paths, error });
	}
}



