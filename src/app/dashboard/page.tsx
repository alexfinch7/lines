'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from 'recharts';

type SceneSummary = {
  id: string;
  title: string;
  projectName: string | null;
  createdAt: string | null;
  tags: string[];
  isAudition: boolean;
  totalMinutes: number;
};

type DashboardData = {
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
  allScenes: SceneSummary[];
  checklist: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditionRange, setAuditionRange] = useState<'week' | 'month'>('week');
  const [selectedTag, setSelectedTag] = useState<string | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<string | 'all'>('all');
  const [auditionOnly, setAuditionOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session }
        } = await supabaseClient.auth.getSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        const res = await fetch('/api/dashboard', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: 'no-store'
        });

        if (!res.ok) {
          setError('Failed to load dashboard data.');
          return;
        }

        const json = (await res.json()) as Partial<DashboardData>;

        const normalized: DashboardData = {
          weeklyMinutes: json.weeklyMinutes ?? 0,
          auditionCounts: json.auditionCounts ?? { week: 0, month: 0 },
          avgAuditionsPerWeek: json.avgAuditionsPerWeek ?? 0,
          avgPracticeMinutesPerWeek: json.avgPracticeMinutesPerWeek ?? 0,
          avgPracticeMinutesPerScene: json.avgPracticeMinutesPerScene ?? 0,
          profileName: json.profileName ?? null,
          topScenes: json.topScenes ?? [],
          auditionHeat: json.auditionHeat ?? [],
          scenesByTag: json.scenesByTag ?? [],
          auditionsByTag: json.auditionsByTag ?? [],
          understudyUsage: json.understudyUsage ?? [],
          allScenes: json.allScenes ?? [],
          checklist: json.checklist ?? null
        };

        if (!cancelled) {
          setData(normalized);
        }
      } catch (e) {
        if (!cancelled) {
          setError('Something went wrong while loading your stats.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.replace('/login');
  };

  const formatWeekLabel = (weekStart: string) => {
    const d = new Date(weekStart);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  };

   const chartColors = ['#3D5A80', '#98C1D9', '#EE6C4D', '#CBA886', '#8D99AE', '#2A9D8F', '#F4A261'];
 
   const cardBase: CSSProperties = {
    padding: 20,
    borderRadius: 16,
    background: '#ffffff',
    boxShadow: '0 14px 30px rgba(0,0,0,0.04)',
    border: '1px solid var(--clay20)'
  };

   const sectionTitle: CSSProperties = {
     fontFamily: 'var(--font-sans)',
     fontSize: 13,
     color: '#7a6666',
     textTransform: 'uppercase',
     letterSpacing: 1.1,
     marginBottom: 8
   };

   const sectionSub: CSSProperties = {
     fontFamily: 'var(--font-sans)',
     fontSize: 13,
     color: '#7a6666',
     marginBottom: 12
   };

   const emptyText: CSSProperties = {
     fontFamily: 'var(--font-sans)',
     fontSize: 13,
     color: '#7a6666'
   };

   const legendLabel: CSSProperties = {
     fontFamily: 'var(--font-sans)',
     fontSize: 12,
     color: '#7a6666'
   };

  const [greetingText, setGreetingText] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.profileName) return;

    const hour = new Date().getHours();
    // Evening: 6pm–4am, Morning: 4am–noon, Afternoon: noon–6pm
    let baseGreeting: string;
    if (hour >= 18 || hour < 4) {
      baseGreeting = `Good evening, ${data.profileName}`;
    } else if (hour < 12) {
      baseGreeting = `Good morning, ${data.profileName}`;
    } else {
      baseGreeting = `Good afternoon, ${data.profileName}`;
    }

    const funTemplates = [
      'Places, {name}',
      'Break legs, {name}',
      'Rolling, {name}',
      'No slate needed, {name}',
      'Callbacks fear you, {name}',
      'Hey, scene-partner',
      'Ready when you are, {name}',
      'Your mark, {name}'
    ];

    let finalGreeting = baseGreeting;
    if (Math.random() < 0.25) {
      const tmpl = funTemplates[Math.floor(Math.random() * funTemplates.length)];
      finalGreeting = tmpl.replace('{name}', data.profileName);
    }

    setGreetingText(finalGreeting);
  }, [data?.profileName]);

  const allTags = useMemo(() => {
    if (!data?.allScenes) return [] as string[];
    const set = new Set<string>();
    for (const scene of data.allScenes) {
      for (const tag of scene.tags) {
        set.add(tag);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.allScenes]);

  const allProjects = useMemo(() => {
    if (!data?.allScenes) return [] as string[];
    const set = new Set<string>();
    for (const scene of data.allScenes) {
      if (scene.projectName) set.add(scene.projectName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.allScenes]);

  const filteredScenes = useMemo(() => {
    if (!data?.allScenes) return [] as SceneSummary[];
    return data.allScenes.filter((scene) => {
      if (auditionOnly && !scene.isAudition) return false;
      if (selectedTag !== 'all' && !scene.tags.includes(selectedTag)) return false;
      if (selectedProject !== 'all' && scene.projectName !== selectedProject) return false;
      return true;
    });
  }, [data?.allScenes, auditionOnly, selectedTag, selectedProject]);

  const sceneById = useMemo(() => {
    const map = new Map<string, SceneSummary>();
    for (const scene of data?.allScenes ?? []) {
      map.set(scene.id, scene);
    }
    return map;
  }, [data?.allScenes]);

  const handleSceneClick = (sceneId: string) => {
    // Placeholder – can be wired to open a scene detail page later.
    console.log('Scene clicked', sceneId);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--offWhite)',
        padding: '32px 16px'
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                lineHeight: 1.1,
                color: 'var(--espresso)'
              }}
            >
              Understudy - Studio
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: '#5b4a4a',
                marginTop: 7
              }}
            >
              Practice time, audition history, and notes from your phone — all in one place.
            </p>
             {data?.profileName && greetingText && (
               <p
                 style={{
                   fontFamily: 'var(--font-sans)',
				   fontWeight: 400,
                   fontSize: 50,
                   marginTop: 30,
                   color: 'var(--espresso)'
                 }}
               >
                 {greetingText}
               </p>
             )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid var(--clay30)',
              background: '#ffffff',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--espresso)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Log out
          </button>
        </header>

        {loading && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--espresso)'
            }}
          >
            Loading your stats…
          </p>
        )}

        {!loading && error && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: '#b00020'
            }}
          >
            {error}
          </p>
        )}

        {!loading && data && (
          <>
             {/* Row 1: Weekly minutes + audition counts (only place we keep a 2-up grid) */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                alignItems: 'stretch'
              }}
            >
              <div
                style={{
                  ...cardBase,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                    marginBottom: 8
                  }}
                >
                  Minutes practiced this week
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 52,
                    lineHeight: 1.05,
                    color: 'var(--espresso)'
                  }}
                >
                  {data.weeklyMinutes}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    marginTop: 6
                  }}
                >
                  Last 7 days of practice across all scenes.
                </p>
              </div>

              <div
                style={{
                  ...cardBase,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                    marginBottom: 8
                  }}
                >
                  {auditionRange === 'week' ? 'Auditions this week' : 'Auditions this month'}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 52,
                    lineHeight: 1.05,
                    color: 'var(--espresso)'
                  }}
                >
                  {auditionRange === 'week'
                    ? data.auditionCounts.week
                    : data.auditionCounts.month}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 6,
                    gap: 8
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: '#7a6666'
                    }}
                  >
                    Number of audition scenes created in this window.
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      padding: 2,
                      borderRadius: 999,
                      background: 'var(--offWhite)',
                      border: '1px solid var(--clay20)'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setAuditionRange('week')}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        cursor: 'pointer',
                        background:
                          auditionRange === 'week' ? 'var(--navy)' : 'transparent',
                        color: auditionRange === 'week' ? '#ffffff' : '#7a6666'
                      }}
                    >
                      7 days
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditionRange('month')}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        cursor: 'pointer',
                        background:
                          auditionRange === 'month' ? 'var(--navy)' : 'transparent',
                        color: auditionRange === 'month' ? '#ffffff' : '#7a6666'
                      }}
                    >
                      30 days
                    </button>
                  </div>
                </div>
              </div>
            </section>

             {/* Row 1.5: Three quick averages */}
             <section
               style={{
                 display: 'grid',
                 gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                 gap: 16,
                 alignItems: 'stretch'
               }}
             >
               <div
                 style={{
                   ...cardBase,
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'space-between'
                 }}
               >
                 <p style={sectionTitle}>Avg auditions / week</p>
                 <p
                   style={{
                     fontFamily: 'var(--font-display)',
                     fontSize: 32,
                     lineHeight: 1.1,
                     color: 'var(--espresso)'
                   }}
                 >
                   {Number(data.avgAuditionsPerWeek ?? 0).toFixed(1)}
                 </p>
                 <p
                   style={{
                     ...sectionSub,
                     marginTop: 6,
                     marginBottom: 0
                   }}
                 >
                   Based on the last several weeks of audition activity.
                 </p>
               </div>
               <div
                 style={{
                   ...cardBase,
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'space-between'
                 }}
               >
                 <p style={sectionTitle}>Avg practice / week</p>
                 <p
                   style={{
                     fontFamily: 'var(--font-display)',
                     fontSize: 32,
                     lineHeight: 1.1,
                     color: 'var(--espresso)'
                   }}
                 >
                   {Number(data.avgPracticeMinutesPerWeek ?? 0).toFixed(1)} min
                 </p>
                 <p
                   style={{
                     ...sectionSub,
                     marginTop: 6,
                     marginBottom: 0
                   }}
                 >
                   Average practice time per week over your history.
                 </p>
               </div>
               <div
                 style={{
                   ...cardBase,
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'space-between'
                 }}
               >
                 <p style={sectionTitle}>Avg practice / scene</p>
                 <p
                   style={{
                     fontFamily: 'var(--font-display)',
                     fontSize: 32,
                     lineHeight: 1.1,
                     color: 'var(--espresso)'
                   }}
                 >
                   {Number(data.avgPracticeMinutesPerScene ?? 0).toFixed(1)} min
                 </p>
                 <p
                   style={{
                     ...sectionSub,
                     marginTop: 6,
                     marginBottom: 0
                   }}
                 >
                   Average minutes spent per scene you’ve practiced.
                 </p>
               </div>
             </section>

             {/* Row 2: Top scenes (full width) */}
            <section>
              <div
                style={{
                  ...cardBase,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    color: '#7a6666',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1
                  }}
                >
                  Most active scenes
                </p>
                {data.topScenes.length === 0 ? (
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 12,
                      color: '#7a6666',
                      marginTop: 4
                    }}
                  >
                    As you practice more, your top scenes will appear here.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      marginTop: 6
                    }}
                  >
                    {data.topScenes.map((scene) => {
                      const meta = sceneById.get(scene.scriptId);
                      return (
                        <li
                          key={scene.scriptId}
                          onClick={() => handleSceneClick(scene.scriptId)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            padding: '6px 8px',
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              minWidth: 0
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: 13,
                                color: 'var(--espresso)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {scene.title}
                            </span>
                            {meta && (
                              <>
                                <span
                                  style={{
                                    fontFamily: 'var(--font-sans)',
                                    fontSize: 11,
                                    color: '#7a6666',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {(meta.projectName ?? 'No project') +
                                    (meta.createdAt
                                      ? ` • ${formatDate(meta.createdAt)}`
                                      : '')}
                                </span>
                                <span
                                  style={{
                                    display: 'flex',
                                    gap: 4,
                                    flexWrap: 'wrap',
                                    fontFamily: 'var(--font-sans)',
                                    fontSize: 11
                                  }}
                                >
                                  {meta.isAudition && (
                                    <span
                                      style={{
                                        padding: '2px 6px',
                                        borderRadius: 999,
                                        background: '#FDECEF',
                                        color: '#B00020'
                                      }}
                                    >
                                      Audition
                                    </span>
                                  )}
                                  {!meta.isAudition && (
                                    <span
                                      style={{
                                        padding: '2px 6px',
                                        borderRadius: 999,
                                        background: '#E6F2FF',
                                        color: '#26496B'
                                      }}
                                    >
                                      Scene
                                    </span>
                                  )}
                                  {meta.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        padding: '2px 6px',
                                        borderRadius: 999,
                                        background: '#F5F0EA',
                                        color: '#7a6666'
                                      }}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </span>
                              </>
                            )}
                          </div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              color: '#7a6666',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {scene.totalMinutes} min
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Row 3: Audition heat (full width) */}
            <section>
              <div
                style={{
                  ...cardBase,
                  minHeight: 260,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                    marginBottom: 8
                  }}
                >
                  Audition heat (last 6 weeks)
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    marginBottom: 12
                  }}
                >
                  Each dot is how many audition scenes you created that week.
                </p>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={data.auditionHeat.map((d) => ({
                        ...d,
                        label: formatWeekLabel(d.weekStart)
                      }))}
                      margin={{ left: -20, right: 12, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fontFamily: 'var(--font-sans)', fill: '#7a6666' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fontFamily: 'var(--font-sans)', fill: '#7a6666' }}
                      />
                      <Tooltip
                        labelFormatter={(label) => `Week of ${label}`}
                        formatter={(value: any) => [`${value} auditions`, 'Auditions']}
                      />
                      <Line
                        type="monotone"
                        dataKey="auditionCount"
                        stroke="#3D5A80"
                        strokeWidth={2}
                        dot={{ r: 5 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Checklist as its own full-width row */}
            {data.checklist && data.checklist.trim().length > 0 && (
              <section>
                <div
                  style={{
                    ...cardBase,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 260
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: '#7a6666',
                      textTransform: 'uppercase',
                      letterSpacing: 1.1,
                      marginBottom: 8
                    }}
                  >
                    Checklist
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: '#7a6666',
                      marginBottom: 8
                    }}
                  >
                    These are your running notes from the app.
                  </p>
                  <div
                    style={{
                      flex: 1,
                      marginTop: 4,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid var(--clay20)',
                      background: 'var(--offWhite)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--espresso)',
                      whiteSpace: 'pre-wrap',
                      overflowY: 'auto',
                      maxHeight: 220
                    }}
                  >
                    {data.checklist}
                  </div>
                </div>
              </section>
            )}

             {/* Row 4: TWO-UP PIE CHARTS */}
             <section
               style={{
                 display: 'grid',
                 gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                 gap: 16,
                 alignItems: 'stretch'
               }}
             >
               {/* Scenes by tag */}
               <div style={{ ...cardBase, minHeight: 260 }}>
                 <p style={sectionTitle}>Your scenes by type</p>
                 <p style={sectionSub}>
                   Share of your scenes that carry each tag (excluding audition).
                 </p>

                 {data.scenesByTag.length === 0 ? (
                   <p style={emptyText}>Once you start tagging scenes, this will light up.</p>
                 ) : (
                   <div style={{ width: '100%', height: 220 }}>
                     <ResponsiveContainer>
                       <PieChart>
                         <Pie
                           data={data.scenesByTag}
                           dataKey="count"
                           nameKey="tag"
                           innerRadius={50}
                           outerRadius={80}
                           paddingAngle={2}
                         >
                           {data.scenesByTag.map((entry, index) => (
                             <Cell
                               key={entry.tag}
                               fill={chartColors[index % chartColors.length]}
                             />
                           ))}
                         </Pie>
                         <Legend
                           verticalAlign="middle"
                           align="right"
                           layout="vertical"
                           iconType="circle"
                           formatter={(value) => <span style={legendLabel}>{value}</span>}
                         />
                         <Tooltip
                           formatter={(value: any, name: any) => [
                             `${value} scene${value === 1 ? '' : 's'}`,
                             name
                           ]}
                         />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                 )}
               </div>

               {/* Auditions by tag */}
               <div style={{ ...cardBase, minHeight: 260 }}>
                 <p style={sectionTitle}>Your auditions by type</p>
                 <p style={sectionSub}>
                   For audition scenes, this shows how often each tag appears.
                 </p>

                 {data.auditionsByTag.length === 0 ? (
                   <p style={emptyText}>
                     Once you add more audition scenes, you’ll see distribution here.
                   </p>
                 ) : (
                   <div style={{ width: '100%', height: 220 }}>
                     <ResponsiveContainer>
                       <PieChart>
                         <Pie
                           data={data.auditionsByTag}
                           dataKey="count"
                           nameKey="tag"
                           innerRadius={50}
                           outerRadius={80}
                           paddingAngle={2}
                         >
                           {data.auditionsByTag.map((entry, index) => (
                             <Cell
                               key={entry.tag}
                               fill={chartColors[index % chartColors.length]}
                             />
                           ))}
                         </Pie>
                         <Legend
                           verticalAlign="middle"
                           align="right"
                           layout="vertical"
                           iconType="circle"
                           formatter={(value) => <span style={legendLabel}>{value}</span>}
                         />
                         <Tooltip
                           formatter={(value: any, name: any) => [
                             `${value} scene${value === 1 ? '' : 's'}`,
                             name
                           ]}
                         />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                 )}
               </div>
             </section>

            {/* Row 6: Understudy usage (full width) */}
            <section>
              <div
                style={{
                  ...cardBase,
                  minHeight: 260
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                    marginBottom: 8
                  }}
                >
                  Understudy usage
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: '#7a6666',
                    marginBottom: 12
                  }}
                >
                  Total minutes spent in Run, Tape, and Flashcard modes across all sessions.
                </p>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={data.understudyUsage}
                      margin={{ left: -20, right: 12, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 11, fontFamily: 'var(--font-sans)', fill: '#7a6666' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fontFamily: 'var(--font-sans)', fill: '#7a6666' }}
                        label={{
                          value: 'Minutes',
                          angle: -90,
                          position: 'insideLeft',
                          style: {
                            textAnchor: 'middle',
                            fill: '#7a6666',
                            fontSize: 11,
                            fontFamily: 'var(--font-sans)'
                          }
                        }}
                      />
                      <Tooltip
                        formatter={(value: any) => [
                          `${Number(value).toFixed(1)} min`,
                          'Time used'
                        ]}
                        labelFormatter={(label) => label}
                      />
                      <Bar dataKey="durationMinutes" radius={[6, 6, 0, 0]} fill="#3D5A80" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Row 7: All scenes list with filters (full width) */}
            <section>
              <div
                style={{
                  ...cardBase,
                  minHeight: 260,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: '#7a6666',
                      textTransform: 'uppercase',
                      letterSpacing: 1.1
                    }}
                  >
                    All scenes
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedTag('all')}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: '1px solid var(--clay20)',
                          background: selectedTag === 'all' ? 'var(--navy)' : '#ffffff',
                          color: selectedTag === 'all' ? '#ffffff' : '#7a6666',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        All tags
                      </button>
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSelectedTag(tag)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--clay20)',
                            background:
                              selectedTag === tag ? 'var(--navy)' : 'rgba(255,255,255,0.9)',
                            color: selectedTag === tag ? '#ffffff' : '#7a6666',
                            fontFamily: 'var(--font-sans)',
                            fontSize: 11,
                            cursor: 'pointer'
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    <div
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <label
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          color: '#7a6666',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        Project
                        <select
                          value={selectedProject}
                          onChange={(e) =>
                            setSelectedProject(e.target.value as 'all' | string)
                          }
                          style={{
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--clay20)',
                            fontFamily: 'var(--font-sans)',
                            fontSize: 12,
                            background: '#ffffff'
                          }}
                        >
                          <option value="all">All</option>
                          {allProjects.map((project) => (
                            <option key={project} value={project}>
                              {project}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          color: '#7a6666',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={auditionOnly}
                          onChange={(e) => setAuditionOnly(e.target.checked)}
                        />
                        Auditions only
                      </label>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 4,
                    maxHeight: 260,
                    overflowY: 'auto',
                    borderRadius: 12,
                    border: '1px solid var(--clay20)',
                    background: 'var(--offWhite)'
                  }}
                >
                  {filteredScenes.length === 0 ? (
                    <p
                      style={{
                        padding: 12,
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        color: '#7a6666'
                      }}
                    >
                      No scenes match these filters yet.
                    </p>
                  ) : (
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0
                      }}
                    >
                      {filteredScenes.map((scene) => (
                        <li
                          key={scene.id}
                          onClick={() => handleSceneClick(scene.id)}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            cursor: 'pointer'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                              minWidth: 0
                            }}
                          >
                            {/* Row 1: title + total minutes on the right */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                                gap: 8,
                                minWidth: 0
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: 13,
                                  color: 'var(--espresso)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {scene.title}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                  color: '#7a6666',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {scene.totalMinutes} min
                              </span>
                            </div>

                            {/* Row 2: project + date on the left, tags/status on the right */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                                minWidth: 0
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: 11,
                                  color: '#7a6666',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {(scene.projectName ?? 'No project') +
                                  (scene.createdAt
                                    ? ` • ${formatDate(scene.createdAt)}`
                                    : '')}
                              </span>
                              <span
                                style={{
                                  display: 'flex',
                                  gap: 4,
                                  flexWrap: 'wrap',
                                  justifyContent: 'flex-end',
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: 11
                                }}
                              >
                                {scene.isAudition ? (
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 999,
                                      background: '#FDECEF',
                                      color: '#B00020'
                                    }}
                                  >
                                    Audition
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 999,
                                      background: '#E6F2FF',
                                      color: '#26496B'
                                    }}
                                  >
                                    Scene
                                  </span>
                                )}
                                {scene.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 999,
                                      background: '#F5F0EA',
                                      color: '#7a6666'
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
