'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  RefreshCw, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

interface UserEmbeddingStats {
  total_users: number;
  users_with_embeddings: number;
  users_with_engagements: number;
  users_needing_embeddings: number;
  coverage_percentage: number;
}

interface BackfillResult {
  status: string;
  processed: number;
  successful: number;
  failed: number;
  error?: string;
}

export function UserEmbeddingManagement() {
  const [stats, setStats] = useState<UserEmbeddingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [generatingUser, setGeneratingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [minEngagements, setMinEngagements] = useState('5');
  const [batchSize, setBatchSize] = useState('100');

  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await adminFetch<UserEmbeddingStats>('/user-embeddings/stats');
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleBackfill = async () => {
    setBackfilling(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await adminFetch<BackfillResult>(
        `/user-embeddings/backfill?min_engagements=${minEngagements}&batch_size=${batchSize}`,
        { method: 'POST' }
      );

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(
          `Successfully generated ${result.successful} user embeddings! ` +
          `(${result.failed} failed, ${result.processed} total processed)`
        );
        // Refresh stats
        await fetchStats();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to backfill embeddings');
    } finally {
      setBackfilling(false);
    }
  };

  const handleGenerateForUser = async () => {
    if (!userId.trim()) {
      setError('Please enter a user ID');
      return;
    }

    setGeneratingUser(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await adminFetch<any>(
        '/user-embeddings/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            min_engagements: parseInt(minEngagements) || 0
          })
        }
      );

      if (result.status === 'skipped') {
        setError(result.message || 'User has insufficient engagements');
      } else {
        setSuccess(`Successfully generated embedding for user ${userId}!`);
        setUserId('');
        // Refresh stats
        await fetchStats();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate user embedding');
    } finally {
      setGeneratingUser(false);
    }
  };

  const getCoverageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCoverageIcon = (percentage: number) => {
    if (percentage >= 90) return CheckCircle;
    if (percentage >= 50) return TrendingUp;
    return AlertTriangle;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Embedding Management
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate and manage user embeddings from engagement history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_users}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                With Embeddings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.users_with_embeddings}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Need Embeddings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.users_needing_embeddings}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Users with engagement history
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getCoverageColor(stats.coverage_percentage)}`}>
                {stats.coverage_percentage.toFixed(1)}%
              </div>
              <Progress value={stats.coverage_percentage} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="w-4 h-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Batch Backfill */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Batch Generate Embeddings
          </CardTitle>
          <CardDescription>
            Generate embeddings for all users with engagement history. This uses the User Tower
            transformer to process their last 50 interactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minEngagements">Minimum Engagements</Label>
              <Input
                id="minEngagements"
                type="number"
                min="0"
                value={minEngagements}
                onChange={(e) => setMinEngagements(e.target.value)}
                placeholder="5"
              />
              <p className="text-xs text-muted-foreground">
                Only generate for users with at least this many interactions
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch Size</Label>
              <Input
                id="batchSize"
                type="number"
                min="1"
                max="1000"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder="100"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of users to process
              </p>
            </div>
          </div>

          <Button 
            onClick={handleBackfill} 
            disabled={backfilling || loading}
            className="w-full"
          >
            {backfilling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Embeddings...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate All User Embeddings
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Single User Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Generate for Specific User
          </CardTitle>
          <CardDescription>
            Generate or regenerate embedding for a single user by their ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user UUID"
            />
          </div>

          <Button 
            onClick={handleGenerateForUser} 
            disabled={generatingUser || !userId.trim()}
            className="w-full"
            variant="secondary"
          >
            {generatingUser ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Embedding
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="text-sm">How User Embeddings Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            User embeddings are 128-dimensional vectors that represent a user's content preferences
            based on their engagement history (likes, replies, reposts, etc.).
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Generated using the User Tower transformer</li>
            <li>Based on last 50 engagement events</li>
            <li>Updated incrementally via online learning</li>
            <li>Auto-generated after 5+ engagements</li>
            <li>Essential for personalized recommendations</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
