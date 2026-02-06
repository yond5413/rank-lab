'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

interface AttentionTestResult {
  post_id: string;
  results: Array<{
    batch_id: number;
    target_position: number;
    target_score: any;
    all_scores: any[];
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

export function AttentionVerificationTab() {
  const [testPostId, setTestPostId] = useState('');
  const [testResult, setTestResult] = useState<AttentionTestResult | null>(null);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVerificationLogs = async () => {
    try {
      const logs = await adminFetch<VerificationLog[]>('/attention-verification/logs?limit=25');
      setVerificationLogs(logs);
    } catch (err) {
      console.error('Failed to fetch verification logs:', err);
    }
  };

  useEffect(() => {
    fetchVerificationLogs();
  }, []);

  const runAttentionTest = async () => {
    if (!testPostId.trim()) {
      setError('Please enter a post ID to test');
      return;
    }

    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await adminFetch<AttentionTestResult>('/attention-verification', {
        method: 'POST',
        body: JSON.stringify({
          post_id: testPostId,
          batch_configs: [
            {
              post_id: testPostId,
              candidate_positions: [0, 1, 2],
            },
            {
              post_id: testPostId,
              candidate_positions: [1, 0, 2],
            },
          ],
        }),
      })
      setTestResult(result);
      
      // Refresh logs after test
      await fetchVerificationLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Test Runner */}
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
              <Label htmlFor="post-id">Post ID to Test</Label>
              <Input
                id="post-id"
                placeholder="Enter post UUID"
                value={testPostId}
                onChange={(e) => setTestPostId(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button onClick={runAttentionTest} disabled={loading || !testPostId.trim()}>
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

          {testResult && (
            <div className="mt-6 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Test Results</h4>
                <Badge variant={testResult.consistency_metrics.is_consistent ? "default" : "destructive"}>
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
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Post ID</Label>
                  <p className="font-mono text-xs">{testResult.post_id}</p>
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
            <div className="space-y-3">
              {verificationLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
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