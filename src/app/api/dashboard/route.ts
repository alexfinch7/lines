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

type DashboardResponse = {
	weeklyMinutes: number;
	auditionCounts: { week: number; month: number };
	avgAuditionsPerWeek: number;
	avgPracticeMinutesPerWeek: number;
	avgPracticeMinutesPerScene: number;
	profileName: string | null;
	topScenes: { scriptId: string; title: string; totalMinutes: number }[];
	auditionHeat: { weekStart: string; auditionCount: number }[];
	scenesByTag: { tag: string; count: number }[];
	auditionsByTag: { tag: string; count: number }[];
	understudyUsage: { category: string; durationMinutes: number }[];
	allScenes: {
		id: string;
		title: string;
		projectName: string | null;
		createdAt: string | null;
		tags: string[];
		isAudition: boolean;
		totalMinutes: number;
	}[];
	checklist: string | null;
};

export async function GET(request: Request) {
	const { user } = await getUserFromRequest(request);

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id as string;

	try {
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		const sixWeeksAgo = new Date(now.getTime() - 6 * 7 * 24 * 60 * 60 * 1000);

		// 1) Practice minutes in the last 7 days
		const { data: recentSessions, error: recentError } = await supabaseAdmin
			.from('practice_sessions')
			.select('duration_ms, running_duration_ms, started_at')
			.eq('user_id', userId)
			.gte('started_at', sevenDaysAgo.toISOString());

		if (recentError) {
			console.error('Error loading recent sessions', recentError);
		}

		const totalMsThisWeek =
			recentSessions?.reduce((sum, row: any) => {
				const duration =
					typeof row.duration_ms === 'number'
						? row.duration_ms
						: typeof row.running_duration_ms === 'number'
							? row.running_duration_ms
							: 0;
				return sum + duration;
			}, 0) ?? 0;

		const weeklyMinutes = Math.round(totalMsThisWeek / 60000);

		// 1b) Auditions this week / month (based on is_audition_scene flag)
		const { data: auditionsLastWeek, error: auditionsWeekError } = await supabaseAdmin
			.from('scripts')
			.select('id')
			.eq('user_id', userId)
			.eq('is_audition_scene', true)
			.gte('created_at', sevenDaysAgo.toISOString());

		if (auditionsWeekError) {
			console.error('Error loading auditions for last 7 days', auditionsWeekError);
		}

		const { data: auditionsLastMonth, error: auditionsMonthError } = await supabaseAdmin
			.from('scripts')
			.select('id')
			.eq('user_id', userId)
			.eq('is_audition_scene', true)
			.gte('created_at', thirtyDaysAgo.toISOString());

		if (auditionsMonthError) {
			console.error('Error loading auditions for last 30 days', auditionsMonthError);
		}

		const auditionCounts = {
			week: auditionsLastWeek?.length ?? 0,
			month: auditionsLastMonth?.length ?? 0
		};

		// 2) Top 3 scenes by total practice duration (all time) + Understudy usage buckets
		const { data: allSessions, error: allSessionsError } = await supabaseAdmin
			.from('practice_sessions')
			.select(
				'script_id, duration_ms, running_duration_ms, taping_duration_ms, flashcards_duration_ms, started_at'
			)
			.eq('user_id', userId);

		if (allSessionsError) {
			console.error('Error loading all sessions', allSessionsError);
		}

		let runMs = 0;
		let tapeMs = 0;
		let flashcardMs = 0;
		let totalMsAllTime = 0;
		let firstSessionAt: Date | null = null;

		const durationByScript = new Map<string, number>();
		for (const row of allSessions ?? []) {
			const duration =
				typeof row.duration_ms === 'number'
					? row.duration_ms
					: typeof row.running_duration_ms === 'number'
						? row.running_duration_ms
						: 0;
			totalMsAllTime += duration;

			if (row.started_at) {
				const d = new Date(row.started_at as string);
				if (!firstSessionAt || d < firstSessionAt) {
					firstSessionAt = d;
				}
			}
			if (typeof row.running_duration_ms === 'number') {
				runMs += row.running_duration_ms;
			}
			if (typeof row.taping_duration_ms === 'number') {
				tapeMs += row.taping_duration_ms;
			}
			if (typeof row.flashcards_duration_ms === 'number') {
				flashcardMs += row.flashcards_duration_ms;
			}

			if (!row.script_id) continue;
			durationByScript.set(row.script_id, (durationByScript.get(row.script_id) ?? 0) + duration);
		}

		const sortedScripts = Array.from(durationByScript.entries()).sort((a, b) => b[1] - a[1]);
		const topScriptIds = sortedScripts.slice(0, 3).map(([scriptId]) => scriptId);

		let topScenes: DashboardResponse['topScenes'] = [];
		if (topScriptIds.length > 0) {
			const { data: scriptRows, error: scriptsError } = await supabaseAdmin
				.from('scripts')
				.select('id, title')
				.in('id', topScriptIds);

			if (scriptsError) {
				console.error('Error loading scripts for top scenes', scriptsError);
			}

			const titleById = new Map<string, string>();
			for (const row of scriptRows ?? []) {
				titleById.set(row.id, row.title ?? 'Untitled Scene');
			}

			topScenes = sortedScripts.slice(0, 3).map(([scriptId, totalMs]) => ({
				scriptId,
				title: titleById.get(scriptId) ?? 'Untitled Scene',
				totalMinutes: Math.round(totalMs / 60000)
			}));
		}

		const understudyUsage: DashboardResponse['understudyUsage'] = [
			{ category: 'Run', durationMinutes: runMs / 60000 },
			{ category: 'Tape', durationMinutes: tapeMs / 60000 },
			{ category: 'Flashcard', durationMinutes: flashcardMs / 60000 }
		];

		// 3) Scenes by tag (all time, excluding audition tag) + full scene list
		const { data: allScripts, error: allScriptsError } = await supabaseAdmin
			.from('scripts')
			.select('id, title, tags, is_audition_scene, project_name, created_at')
			.eq('user_id', userId);

		if (allScriptsError) {
			console.error('Error loading all scripts for tag breakdown', allScriptsError);
		}

		const scriptsArr = allScripts ?? [];

		const tagToScriptSet = new Map<string, Set<string>>();
		const auditionScriptsAll: { id: string; tags: string[] }[] = [];

		for (const row of scriptsArr as any[]) {
			const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
			const isAudition =
				row.is_audition_scene === true ||
				(Array.isArray(tags) && tags.includes('audition'));

			if (isAudition) {
				auditionScriptsAll.push({ id: row.id, tags });
			}

			for (const tag of tags) {
				if (tag === 'audition') continue;
				if (!tagToScriptSet.has(tag)) {
					tagToScriptSet.set(tag, new Set<string>());
				}
				tagToScriptSet.get(tag)!.add(row.id);
			}
		}

		const scenesByTag: DashboardResponse['scenesByTag'] = Array.from(tagToScriptSet.entries())
			.map(([tag, set]) => ({
				tag,
				count: set.size
			}))
			.sort((a, b) => b.count - a.count);

		// 4) Audition scenes by tag (excluding the audition tag itself)
		const auditionTagCounts = new Map<string, number>();
		for (const script of auditionScriptsAll) {
			const tagsWithoutAudition = script.tags.filter((t) => t !== 'audition');
			if (tagsWithoutAudition.length === 0) {
				const key = 'untagged';
				auditionTagCounts.set(key, (auditionTagCounts.get(key) ?? 0) + 1);
				continue;
			}
			for (const tag of tagsWithoutAudition) {
				auditionTagCounts.set(tag, (auditionTagCounts.get(tag) ?? 0) + 1);
			}
		}

		const auditionsByTag: DashboardResponse['auditionsByTag'] = Array.from(auditionTagCounts.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count);

		const allScenes: DashboardResponse['allScenes'] = scriptsArr
			.map((row: any) => {
				const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
				const isAudition =
					row.is_audition_scene === true || (Array.isArray(tags) && tags.includes('audition'));
				const scriptId = row.id as string;
				const totalMsForScript = durationByScript.get(scriptId) ?? 0;
				return {
					id: scriptId,
					title: (row.title as string | null) ?? 'Untitled Scene',
					projectName: (row.project_name as string | null) ?? null,
					createdAt: (row.created_at as string | null) ?? null,
					tags,
					isAudition,
					totalMinutes: Math.round(totalMsForScript / 60000)
				};
			})
			.sort((a, b) => {
				const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
				const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
				return bTime - aTime;
			});

		// 5) Audition heat over last ~6 weeks, grouped by week
		const { data: auditionScripts, error: auditionError } = await supabaseAdmin
			.from('scripts')
			.select('id, created_at, is_audition_scene, tags')
			.eq('user_id', userId)
			.gte('created_at', sixWeeksAgo.toISOString());

		if (auditionError) {
			console.error('Error loading audition scripts', auditionError);
		}

		const weekKey = (dateStr: string) => {
			const d = new Date(dateStr);
			const utcDay = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
			const diffToMonday = (utcDay + 6) % 7; // days since Monday
			const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
			monday.setUTCDate(monday.getUTCDate() - diffToMonday);
			return monday.toISOString().slice(0, 10); // YYYY-MM-DD
		};

		const auditionCountsByWeek = new Map<string, number>();
		for (const row of auditionScripts ?? []) {
			const isAudition =
				row.is_audition_scene === true ||
				(Array.isArray(row.tags) && row.tags.includes('audition'));
			if (!isAudition || !row.created_at) continue;
			const key = weekKey(row.created_at as string);
			auditionCountsByWeek.set(key, (auditionCountsByWeek.get(key) ?? 0) + 1);
		}

		// Ensure we include every week over the last 6 weeks, even if count is 0
		const heat: DashboardResponse['auditionHeat'] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
			const key = weekKey(d.toISOString());
			heat.push({
				weekStart: key,
				auditionCount: auditionCountsByWeek.get(key) ?? 0
			});
		}

		const totalAuditionsWindow = heat.reduce((sum, w) => sum + w.auditionCount, 0);
		const avgAuditionsPerWeek = heat.length > 0 ? totalAuditionsWindow / heat.length : 0;

		let avgPracticeMinutesPerWeek = 0;
		if (firstSessionAt) {
			const spanMs = now.getTime() - firstSessionAt.getTime();
			const weeksSpan = Math.max(1, spanMs / (7 * 24 * 60 * 60 * 1000));
			avgPracticeMinutesPerWeek = (totalMsAllTime / 60000) / weeksSpan;
		}

		const sceneCount = durationByScript.size;
		const avgPracticeMinutesPerScene =
			sceneCount > 0 ? (totalMsAllTime / 60000) / sceneCount : 0;

		// 6) Checklist text (if any) and profile name
		const { data: checklistRow, error: checklistError } = await supabaseAdmin
			.from('user_checklists')
			.select('body')
			.eq('user_id', userId)
			.maybeSingle();

		if (checklistError) {
			console.error('Error loading user checklist', checklistError);
		}

		const checklistBody =
			typeof checklistRow?.body === 'string' && checklistRow.body.trim().length > 0
				? checklistRow.body
				: null;

		let profileName: string | null = null;
		const { data: profileRow, error: profileError } = await supabaseAdmin
			.from('profiles')
			.select('stage_name')
			.eq('user_id', userId)
			.maybeSingle();

		if (profileError) {
			console.error('Error loading profile', profileError);
		} else if (typeof profileRow?.stage_name === 'string') {
			const trimmed = profileRow.stage_name.trim();
			profileName = trimmed.length > 0 ? trimmed : null;
		}

		const response: DashboardResponse = {
			weeklyMinutes,
			auditionCounts,
			avgAuditionsPerWeek,
			avgPracticeMinutesPerWeek,
			avgPracticeMinutesPerScene,
			profileName,
			topScenes,
			scenesByTag,
			auditionsByTag,
			understudyUsage,
			allScenes,
			auditionHeat: heat,
			checklist: checklistBody
		};

		return NextResponse.json(response);
	} catch (e) {
		console.error('Unexpected error in /api/dashboard', e);
		return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
	}
}


