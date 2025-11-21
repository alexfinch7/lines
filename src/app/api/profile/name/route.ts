import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

async function getUserFromRequest(request: Request) {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) return { user: null };

	const token = authHeader.slice('Bearer '.length).trim();
	const { data, error } = await supabaseAdmin.auth.getUser(token);
	if (error || !data?.user) return { user: null };

	return { user: data.user };
}

export async function GET(request: Request) {
	const { user } = await getUserFromRequest(request);

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id as string;
	const { data, error } = await supabaseAdmin
		.from('profiles')
		.select('stage_name')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		console.error('Error loading stage name', error);
		return NextResponse.json({ error: 'Failed to load name' }, { status: 500 });
	}

	const stageName =
		typeof data?.stage_name === 'string' && data.stage_name.trim().length > 0
			? data.stage_name.trim()
			: null;

	return NextResponse.json({ stageName });
}

export async function POST(request: Request) {
	const { user } = await getUserFromRequest(request);

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const stageNameRaw = typeof body.stageName === 'string' ? body.stageName : '';
	const stageName = stageNameRaw.trim();

	if (!stageName) {
		return NextResponse.json({ error: 'stageName is required' }, { status: 400 });
	}

	const userId = user.id as string;

	const { error } = await supabaseAdmin
		.from('profiles')
		.upsert(
			{
				user_id: userId,
				stage_name: stageName
			},
			{ onConflict: 'user_id' }
		);

	if (error) {
		console.error('Error saving stage name', error);
		return NextResponse.json({ error: 'Failed to save name' }, { status: 500 });
	}

	return NextResponse.json({ ok: true, stageName });
}


