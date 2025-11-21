declare module 'pdf-poppler' {
	const pdfPoppler: {
		convert(
			inputPath: string,
			options: {
				format?: 'jpeg' | 'png' | 'tiff';
				out_dir?: string;
				out_prefix?: string;
				page?: number | null;
			}
		): Promise<void>;
	};

	export default pdfPoppler;
}


