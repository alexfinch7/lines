import { supabaseAdmin } from '@/lib/supabaseServer';

const PDF_BUCKET = 'reader-recordings';
const PDF_PREFIX = 'sides';

/**
 * Upload the given PDF file to Supabase Storage and return a public URL
 * that Mistral can fetch.
 */
export async function uploadToStorageAndGetUrl(file: File): Promise<string> {
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const ext = 'pdf';
	const safeName = (file.name || 'sides.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
	const timestamp = Date.now();
	const path = `${PDF_PREFIX}/${timestamp}-${safeName}.${ext}`;

	const { error: uploadError } = await supabaseAdmin.storage.from(PDF_BUCKET).upload(path, buffer, {
		contentType: file.type || 'application/pdf',
		upsert: true
	});

	if (uploadError) {
		console.error('Supabase storage upload error (sides PDF):', uploadError);
		throw new Error(uploadError.message ?? 'Failed to upload PDF to Supabase Storage');
	}

	const {
		data: { publicUrl }
	} = supabaseAdmin.storage.from(PDF_BUCKET).getPublicUrl(path);

	return publicUrl;
}



