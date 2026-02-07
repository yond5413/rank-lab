'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Play, RefreshCw, AlertTriangle, Search, FileText, ThumbsUp, Clock, History, Zap, ChevronDown, TrendingUp, BarChart3 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAdminDate } from '@/lib/adminDateFormat';

interface AttentionTestResult {
  post_id: string;
  results: Array<{
    batch_id: number;
    target_position: number;
    target_score: number;
    all_scores: number[];
  }>;
  consistency_metrics: {
    is_consistent: boolean;
    max_score_diff: number;
    score_variance: number;
    threshold: number;
  };
}

interface VerificationLog {
  id: string;
  post_id: string;
  batch_1_score: number;
  batch_2_score: number;
  score_diff: number;
  test_timestamp: string;
  is_consistent: boolean;
}

interface PostSuggestion {
  id: string;
  content_preview: string;
  likes_count: number;
  created_at: string;
  has_test_history: boolean;
  last_test_status: boolean | null;
  last_test_timestamp: string | null;
  test_count: number;
}

interface TestStats {
  totalTests: number;
  passCount: number;
  failCount: number;
  passRate: number;
  avgScoreDiff: number;
}

const ACTION_LABELS = ['like', 'reply', 'repost', 'quote', 'bookmark'];

export function AttentionVerificationTab() {
  const [testPostId, setTestPostId] = useState('');
  const [testResult, setTestResult] = useState<AttentionTestResult | null>(null);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PostSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [testStats, setTestStats] = useState<TestStats | null>(null);
  const [quickTesting, setQuickTesting] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const fetchVerificationLogs = useCallback(async () => {
    try {
      const logs = await adminFetch<VerificationLog[]>('/attention-verification/logs?limit=50');
      setVerificationLogs(logs);
      
      // Calculate stats
      if (logs.length > 0) {
        const passCount = logs.filter(l => l.is_consistent).length;
        const avgDiff = logs.reduce((sum, l) => sum + l.score_diff, 0) / logs.length;
        setTestStats({
          totalTests: logs.length,
          passCount,
          failCount: logs.length - passCount,
          passRate: Math.round((passCount / logs.length) * 100),
          avgScoreDiff: avgDiff
        });
      }
    } catch (err) {
      console.error('Failed to fetch verification logs:', err);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('type', suggestionFilter);
      params.append('limit', '50');
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const data = await adminFetch<PostSuggestion[]>(`/posts/suggestions?${params.toString()}`);
      setSuggestions(data);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  }, [suggestionFilter, searchQuery]);

  useEffect(() => {
    fetchVerificationLogs();
  }, [fetchVerificationLogs]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const runAttentionTest = async (postId?: string) => {
    const targetPostId = postId || testPostId;
    if (!targetPostId.trim()) {
      setError('Please select a post to test');
      return;
    }

    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await adminFetch<AttentionTestResult>('/attention-verification', {
        method: 'POST',
        body: JSON.stringify({
          post_id: targetPostId,
          batch_configs: [
            {
              post_id: targetPostId,
              candidate_positions: [0, 1, 2],
            },
            {
              post_id: targetPostId,
              candidate_positions: [1, 0, 2],
            },
          ],
        }),
      });
      setTestResult(result);
      await fetchVerificationLogs();
      await fetchSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const runBulkTest = async (type: 'random' | 'failed' | 'popular' | 'recent') => {
    setQuickTesting(true);
    setError(null);
    
    try {
      let postsToTest: PostSuggestion[] = [];
      
      if (type === 'random') {
        const allPosts = await adminFetch<PostSuggestion[]>('/posts/suggestions?type=recent&limit=100');
        // Pick 5 random posts
        postsToTest = allPosts.sort(() => 0.5 - Math.random()).slice(0, 5);
      } else if (type === 'failed') {
        const failedTests = verificationLogs.filter(l => !l.is_consistent);
        const uniqueFailedIds = [...new Set(failedTests.map(l => l.post_id))].slice(0, 5);
        for (const id of uniqueFailedIds) {
          await runAttentionTest(id);
        }
        setQuickTesting(false);
        return;
      } else if (type === 'popular') {
        postsToTest = await adminFetch<PostSuggestion[]>('/posts/suggestions?type=popular&limit=5');
      } else if (type === 'recent') {
        postsToTest = await adminFetch<PostSuggestion[]>('/posts/suggestions?type=recent&limit=5');
      }
      
      for (const post of postsToTest) {
        await runAttentionTest(post.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk test failed');
    } finally {
      setQuickTesting(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return formatAdminDate(timestamp);
  };

  const formatRelativeTime = (timestamp: string) => {
    if (now === null) {
      return formatAdminDate(timestamp);
    }

    const diff = now - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getScoreBarWidth = (score: number) => {
    return `${Math.min(Math.max(score * 100, 0), 100)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      {testStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Tests</p>
                  <p className="text-2xl font-bold">{testStats.totalTests}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pass Rate</p>
                  <p className="text-2xl font-bold text-green-600">{testStats.passRate}%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{testStats.failCount}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Diff</p>
                  <p className="text-2xl font-bold">{testStats.avgScoreDiff.toFixed(4)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Quick Test Actions
          </CardTitle>
          <CardDescription>
            Run tests on multiple posts at once
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runBulkTest('random')}
              disabled={quickTesting}
            >
              <Play className="w-4 h-4 mr-2" />
              Test 5 Random
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runBulkTest('failed')}
              disabled={quickTesting || !testStats || testStats.failCount === 0}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Retest Failed
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runBulkTest('popular')}
              disabled={quickTesting}
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Test Popular
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runBulkTest('recent')}
              disabled={quickTesting}
            >
              <Clock className="w-4 h-4 mr-2" />
              Test Recent
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Runner with Searchable Dropdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Attention Masking Test
          </CardTitle>
          <CardDescription>
            Test candidate isolation consistency by scoring the same post in different batch positions.
            Scores should remain consistent (difference &lt; 0.01) regardless of position.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="post-search">Select Post to Test</Label>
              <Popover open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={suggestionsOpen}
                    className="w-full justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Search className="h-4 w-4 shrink-0 opacity-50" />
                      {testPostId ? (
                        suggestions.find((s) => s.id === testPostId)?.content_preview || testPostId
                      ) : (
                        <span className="text-muted-foreground">Search posts...</span>
                      )}
                    </div>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[600px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search posts by content..." 
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <div className="border-b px-3 py-2">
                      <Tabs value={suggestionFilter} onValueChange={setSuggestionFilter}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="recent">Recent</TabsTrigger>
                          <TabsTrigger value="popular">Popular</TabsTrigger>
                          <TabsTrigger value="tested">Tested</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <CommandList>
                      <CommandEmpty>No posts found.</CommandEmpty>
                      <CommandGroup>
                        {suggestions.map((suggestion) => (
                          <CommandItem
                            key={suggestion.id}
                            value={suggestion.id}
                            onSelect={(currentValue) => {
                              setTestPostId(currentValue === testPostId ? "" : currentValue);
                              setSuggestionsOpen(false);
                            }}
                            className="flex items-start gap-3 py-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="text-sm truncate">{suggestion.content_preview}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <ThumbsUp className="h-3 w-3" />
                                  {suggestion.likes_count}
                                </span>
                                {suggestion.has_test_history && (
                                  <>
                                    <span className="flex items-center gap-1">
                                      <History className="h-3 w-3" />
                                      {suggestion.test_count} tests
                                    </span>
                                    <Badge 
                                      variant={suggestion.last_test_status ? "default" : "destructive"}
                                      className="text-[10px] px-1 py-0"
                                    >
                                      {suggestion.last_test_status ? '✓ Pass' : '✗ Fail'}
                                    </Badge>
                                    {suggestion.last_test_timestamp && (
                                      <span>{formatRelativeTime(suggestion.last_test_timestamp)}</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            {testPostId === suggestion.id && (
                              <CheckCircle className="h-4 w-4 shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={() => runAttentionTest()} disabled={loading || !testPostId.trim()}>
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Test
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Enhanced Test Results */}
          {testResult && (
            <div className="mt-6 p-4 border rounded-lg bg-muted/50 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Test Results</h4>
                <Badge variant={testResult.consistency_metrics.is_consistent ? "default" : "destructive"} className="text-sm">
                  {testResult.consistency_metrics.is_consistent ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Consistent
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 mr-1" />
                      Inconsistent
                    </>
                  )}
                </Badge>
              </div>
              
              {/* Score Comparison Bars */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-muted-foreground">Batch Score Comparison</h5>
                {testResult.results.map((result, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Batch {result.batch_id + 1} (Position {result.target_position})</span>
                      <span className="font-mono">{result.target_score.toFixed(4)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: getScoreBarWidth(result.target_score) }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Score Difference</span>
                    <span className={`font-mono ${testResult.consistency_metrics.max_score_diff < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.consistency_metrics.max_score_diff.toFixed(4)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Threshold: {testResult.consistency_metrics.threshold} (must be less than)
                  </p>
                </div>
              </div>

              {/* Per-Action Breakdown */}
              {testResult.results.length > 0 && testResult.results[0].all_scores.length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <h5 className="text-sm font-medium text-muted-foreground">Per-Action Predictions (Batch 1)</h5>
                  <div className="grid grid-cols-5 gap-2">
                    {testResult.results[0].all_scores.map((score, idx) => (
                      <div key={idx} className="text-center p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground uppercase">{ACTION_LABELS[idx] || `Action ${idx}`}</p>
                        <p className="font-mono font-medium">{score.toFixed(3)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t text-sm">
                <div>
                  <Label className="text-muted-foreground">Post ID</Label>
                  <p className="font-mono text-xs truncate">{testResult.post_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Max Score Diff</Label>
                  <p className="font-mono">{testResult.consistency_metrics.max_score_diff.toFixed(4)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Score Variance</Label>
                  <p className="font-mono">{testResult.consistency_metrics.score_variance.toFixed(6)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Threshold</Label>
                  <p className="font-mono">{testResult.consistency_metrics.threshold}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Failed Tests */}
      {verificationLogs.filter(l => !l.is_consistent).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Recent Failed Tests
            </CardTitle>
            <CardDescription>
              Click to retest any of these posts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {verificationLogs
                .filter(l => !l.is_consistent)
                .slice(0, 10)
                .map((log) => (
                  <div 
                    key={log.id} 
                    className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted cursor-pointer"
                    onClick={() => runAttentionTest(log.post_id)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Fail</Badge>
                      <span className="font-mono text-sm">{log.post_id}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Diff: {log.score_diff.toFixed(4)}</span>
                      <span>{formatRelativeTime(log.test_timestamp)}</span>
                      <Play className="w-4 h-4" />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Verification Tests</CardTitle>
              <CardDescription>
                History of attention masking verification tests
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchVerificationLogs}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {verificationLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
              <p>No verification tests found</p>
              <p className="text-sm">Run a test above to see results here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {verificationLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <Badge variant={log.is_consistent ? "default" : "destructive"}>
                      {log.is_consistent ? (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {log.is_consistent ? 'Pass' : 'Fail'}
                    </Badge>
                    <div>
                      <p className="font-mono text-sm">{log.post_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(log.test_timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">
                      Diff: {log.score_diff.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.batch_1_score.toFixed(3)} vs {log.batch_2_score.toFixed(3)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Panel */}
      <Card>
        <CardHeader>
          <CardTitle>How Attention Verification Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2 text-green-700">✓ What Should Happen</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Same post scores consistently across different batch positions</li>
                <li>• Score difference should be &lt; 0.01 (epsilon threshold)</li>
                <li>• Candidate isolation prevents cross-candidate attention</li>
                <li>• Model predictions remain stable regardless of context</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-red-700">✗ Warning Signs</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Large score differences (&gt; 0.01) between batches</li>
                <li>• Inconsistent predictions for identical content</li>
                <li>• High score variance across test runs</li>
                <li>• Attention bleeding between candidates</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
