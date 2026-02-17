'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Sparkles,
  Activity
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

interface SeedDataStats {
  posts?: number;
  replies?: number;
  follows?: number;
  likes?: number;
  events?: number;
  bookmarks?: number;
  blocks?: number;
  mutes?: number;
  embeddings?: number;
}

interface SeedDataResponse {
  job_id?: string;
  status: string;
  message?: string;
  stats?: SeedDataStats;
  error?: string;
}

interface StreamEvent {
  progress?: number;
  phase?: string;
  stats?: SeedDataStats;
  done?: boolean;
  error?: string;
}

export function DataSeedTab() {
  const [numPosts, setNumPosts] = useState<number>(300);
  const [useLlm, setUseLlm] = useState<boolean>(true);
  const [skipEmbeddings, setSkipEmbeddings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<SeedDataResponse | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [phase, setPhase] = useState<string>('');
  const [currentStats, setCurrentStats] = useState<SeedDataStats>({});
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setProgress(0);
    setPhase('Starting...');
    setCurrentStats({});

    try {
      // Start the job
      const response = await adminFetch<SeedDataResponse>('/seed-data', {
        method: 'POST',
        body: JSON.stringify({
          num_posts: numPosts,
          use_llm: useLlm,
          skip_embeddings: skipEmbeddings
        })
      });

      if (!response.job_id) {
        throw new Error('No job_id returned');
      }

      // Connect to SSE stream
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const eventSource = new EventSource(`${apiUrl}/api/v1/admin/seed-data/${response.job_id}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data: StreamEvent = JSON.parse(event.data);
          
          if (data.done) {
            // Job completed
            setProgress(100);
            setPhase('Complete!');
            setResult({
              status: data.status || 'success',
              message: 'Seed data generated successfully',
              stats: data.stats
            });
            setLoading(false);
            eventSource.close();
          } else if (data.error) {
            // Job errored
            setResult({
              status: 'error',
              message: 'Seed data generation failed',
              error: data.error
            });
            setLoading(false);
            eventSource.close();
          } else {
            // Update progress
            if (data.progress !== undefined) {
              setProgress(data.progress);
            }
            if (data.phase) {
              setPhase(data.phase);
            }
            if (data.stats) {
              setCurrentStats(data.stats);
            }
          }
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      };

      eventSource.onerror = () => {
        console.error('SSE connection error');
        eventSource.close();
        setLoading(false);
      };

    } catch (err) {
      setResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        error: err instanceof Error ? err.message : String(err)
      });
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Seed Data Configuration
            </CardTitle>
            <CardDescription>
              Configure and generate test data for the recommendation system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="numPosts">Number of Posts</Label>
              <Input
                id="numPosts"
                type="number"
                value={numPosts}
                onChange={(e) => setNumPosts(parseInt(e.target.value) || 0)}
                min={100}
                max={10000}
                step={100}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 5000 posts for good recommendation quality
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="useLlm"
                checked={useLlm}
                onCheckedChange={(checked) => setUseLlm(checked as boolean)}
                disabled={loading}
              />
              <Label htmlFor="useLlm" className="text-sm font-normal">
                Use LLM for content generation (requires OPENROUTER_API_KEY)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="skipEmbeddings"
                checked={skipEmbeddings}
                onCheckedChange={(checked) => setSkipEmbeddings(checked as boolean)}
                disabled={loading}
              />
              <Label htmlFor="skipEmbeddings" className="text-sm font-normal">
                Skip embedding computation (faster, but recommendations won&apos;t work)
              </Label>
            </div>

            <Button 
              onClick={handleGenerate} 
              disabled={loading || numPosts < 100}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Generate Seed Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Progress</CardTitle>
            <CardDescription>
              Live status of seed data generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && !result && (
              <div className="text-center text-muted-foreground py-8">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Click &quot;Generate Seed Data&quot; to create test data</p>
              </div>
            )}

            {loading && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Activity className="w-4 h-4 animate-pulse" />
                      {phase}
                    </span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Posts</p>
                    <p className="text-lg font-semibold">{currentStats.posts?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Replies</p>
                    <p className="text-lg font-semibold">{currentStats.replies?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Likes</p>
                    <p className="text-lg font-semibold">{currentStats.likes?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Follows</p>
                    <p className="text-lg font-semibold">{currentStats.follows?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {result.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                    {result.status}
                  </Badge>
                </div>

                {result.stats && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Posts</p>
                      <p className="text-lg font-semibold">{result.stats.posts?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Replies</p>
                      <p className="text-lg font-semibold">{result.stats.replies?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Follows</p>
                      <p className="text-lg font-semibold">{result.stats.follows?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Likes</p>
                      <p className="text-lg font-semibold">{result.stats.likes?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Events</p>
                      <p className="text-lg font-semibold">{result.stats.events?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Bookmarks</p>
                      <p className="text-lg font-semibold">{result.stats.bookmarks?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Blocks</p>
                      <p className="text-lg font-semibold">{result.stats.blocks?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Mutes</p>
                      <p className="text-lg font-semibold">{result.stats.mutes?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg col-span-2">
                      <p className="text-xs text-muted-foreground">Embeddings</p>
                      <p className="text-lg font-semibold">{result.stats.embeddings?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                )}

                {result.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{result.error}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Seed Data Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>This tool generates test data for the recommendation system including:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Posts</strong> - Content from templates or LLM-generated</li>
            <li><strong>Replies</strong> - Comments on posts</li>
            <li><strong>Follows</strong> - User follow relationships (10-20% of user pairs)</li>
            <li><strong>Likes</strong> - Post likes with Pareto distribution (realistic engagement)</li>
            <li><strong>Views</strong> - Impressions for all posts</li>
            <li><strong>Bookmarks</strong> - Saved posts (10% of posts)</li>
            <li><strong>Blocks/Mutes</strong> - Negative signals (3-7% of user pairs)</li>
            <li><strong>Embeddings</strong> - MiniLM + TwoTower vectors for posts</li>
          </ul>
          <p className="pt-2">
            <strong>Note:</strong> The seed data SQL is generated in <code>backend/scripts/seed_data.sql</code>. 
            You&apos;ll need to run it against your database to load the data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
