import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
	const filePath = path.join(process.cwd(), 'src/app/privacy/privacy.html');
	const htmlContent = await fs.readFile(filePath, 'utf8');

	return (
		<div className="w-full min-h-screen bg-white text-black">
			<div 
				className="max-w-4xl mx-auto p-6 md:p-12"
				dangerouslySetInnerHTML={{ __html: htmlContent }} 
			/>
		</div>
	);
}










