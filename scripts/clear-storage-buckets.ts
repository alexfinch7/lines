// scripts/clear-storage-buckets.ts
// Run with: npx tsx scripts/clear-storage-buckets.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearBucket(bucketName: string) {
	console.log(`\nClearing bucket: ${bucketName}`);

	// List all files in the bucket (need to handle pagination for large buckets)
	let allFiles: string[] = [];
	let offset = 0;
	const limit = 1000;

	while (true) {
		const { data: files, error: listError } = await supabase.storage
			.from(bucketName)
			.list('', { limit, offset });

		if (listError) {
			console.error(`Error listing files in ${bucketName}:`, listError);
			return;
		}

		if (!files || files.length === 0) break;

		// For each item, check if it's a folder and recurse, or add file path
		for (const file of files) {
			if (file.id === null) {
				// It's a folder, need to list its contents
				const folderFiles = await listFolderRecursively(bucketName, file.name);
				allFiles.push(...folderFiles);
			} else {
				allFiles.push(file.name);
			}
		}

		if (files.length < limit) break;
		offset += limit;
	}

	if (allFiles.length === 0) {
		console.log(`  Bucket ${bucketName} is already empty`);
		return;
	}

	console.log(`  Found ${allFiles.length} files to delete`);

	// Delete in batches of 1000 (Supabase limit)
	const batchSize = 1000;
	for (let i = 0; i < allFiles.length; i += batchSize) {
		const batch = allFiles.slice(i, i + batchSize);
		const { error: deleteError } = await supabase.storage.from(bucketName).remove(batch);

		if (deleteError) {
			console.error(`Error deleting batch from ${bucketName}:`, deleteError);
		} else {
			console.log(`  Deleted ${batch.length} files`);
		}
	}

	console.log(`  ✓ Bucket ${bucketName} cleared`);
}

async function listFolderRecursively(bucketName: string, folderPath: string): Promise<string[]> {
	const allPaths: string[] = [];
	let offset = 0;
	const limit = 1000;

	while (true) {
		const { data: files, error } = await supabase.storage
			.from(bucketName)
			.list(folderPath, { limit, offset });

		if (error || !files || files.length === 0) break;

		for (const file of files) {
			const fullPath = `${folderPath}/${file.name}`;
			if (file.id === null) {
				// It's a subfolder
				const subFiles = await listFolderRecursively(bucketName, fullPath);
				allPaths.push(...subFiles);
			} else {
				allPaths.push(fullPath);
			}
		}

		if (files.length < limit) break;
		offset += limit;
	}

	return allPaths;
}

async function main() {
	console.log('=== Clearing Storage Buckets ===');

	await clearBucket('reader-recordings');
	await clearBucket('lines');

	console.log('\n✓ All buckets cleared!');
}

main().catch(console.error);

