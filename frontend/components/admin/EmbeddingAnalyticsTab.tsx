'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, TrendingUp, TrendingDown, Users, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface EmbeddingAnalytics {
  user_embeddings: {
    count: number;
    mean_norm: number;
    std_norm: number;
    dimension: number;
    error?: string;
  };
  post_embeddings: {
    count: number;
    pretrained_count: number;
    personalized_count: number;
    mean_norm: number;
    std_norm: number;
    dimension: number;
    error?: string;
  };
  cold_start: {
    recent_posts: number;
    embedded_posts: number;
    coverage_ratio: number;
    timeframe: string;
    error?: string;
  };
}

export function EmbeddingAnalyticsTab() {
  const [analytics, setAnalytics] = useState<EmbeddingAnalytics | null>(null);
  const [timeframe, setTimeframe] = useState('24h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (selectedTimeframe: string = timeframe) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/admin/embedding-analytics?timeframe=${selectedTimeframe}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
    fetchAnalytics(newTimeframe);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getCoverageStatus = (ratio: number) => {
    if (ratio >= 0.9) return { status: 'excellent', color: 'text-green-600', icon: CheckCircle };
    if (ratio >= 0.7) return { status: 'good', color: 'text-blue-600', icon: TrendingUp };
    if (ratio >= 0.5) return { status: 'warning', color: 'text-yellow-600', icon: AlertTriangle };
    return { status: 'critical', color: 'text-red-600', icon: TrendingDown };
  };

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Embedding Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Monitor embedding distribution, drift, and cold start performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={timeframe} onValueChange={handleTimeframeChange}>
            <TabsList>
              <TabsTrigger value="1h">1H</TabsTrigger>
              <TabsTrigger value="24h">24H</TabsTrigger>
              <TabsTrigger value="7d">7D</TabsTrigger>
              <TabsTrigger value="30d">30D</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => fetchAnalytics()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analytics && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User Embeddings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User Embeddings</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(analytics.user_embeddings.count)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Avg norm: {analytics.user_embeddings.mean_norm.toFixed(3)} ± {analytics.user_embeddings.std_norm.toFixed(3)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {analytics.user_embeddings.dimension}D vectors
                </div>
              </CardContent>
            </Card>

            {/* Post Embeddings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Post Embeddings</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(analytics.post_embeddings.count)}
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary">
                    {formatNumber(analytics.post_embeddings.pretrained_count)} Pre-trained
                  </Badge>
                  <Badge variant="outline">
                    {formatNumber(analytics.post_embeddings.personalized_count)} Personalized
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Avg norm: {analytics.post_embeddings.mean_norm.toFixed(3)} ± {analytics.post_embeddings.std_norm.toFixed(3)}
                </div>
              </CardContent>
            </Card>

            {/* Cold Start Coverage */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cold Start Coverage</CardTitle>
                {(() => {
                  const { icon: Icon } = getCoverageStatus(analytics.cold_start.coverage_ratio);
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(analytics.cold_start.coverage_ratio * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {analytics.cold_start.embedded_posts} / {analytics.cold_start.recent_posts} recent posts
                </div>
                <div className="text-xs text-muted-foreground">
                  Last {analytics.cold_start.timeframe}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Embedding Details */}
            <Card>
              <CardHeader>
                <CardTitle>User Embedding Distribution</CardTitle>
                <CardDescription>
                  Analysis of user embedding vectors and their characteristics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.user_embeddings.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{analytics.user_embeddings.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Vectors</span>
                      <span className="text-sm font-mono">{analytics.user_embeddings.count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Vector Dimension</span>
                      <span className="text-sm font-mono">{analytics.user_embeddings.dimension}D</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Mean L2 Norm</span>
                      <span className="text-sm font-mono">{analytics.user_embeddings.mean_norm.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Std Deviation</span>
                      <span className="text-sm font-mono">{analytics.user_embeddings.std_norm.toFixed(4)}</span>
                    </div>
                    
                    {/* Health Indicator */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Health Status:</span>
                        {analytics.user_embeddings.count > 0 ? (
                          <Badge variant="default">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            No Data
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Post Embedding Details */}
            <Card>
              <CardHeader>
                <CardTitle>Post Embedding Distribution</CardTitle>
                <CardDescription>
                  Analysis of post embedding vectors and personalization status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.post_embeddings.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{analytics.post_embeddings.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Vectors</span>
                      <span className="text-sm font-mono">{analytics.post_embeddings.count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Pre-trained</span>
                      <span className="text-sm font-mono">{analytics.post_embeddings.pretrained_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Personalized</span>
                      <span className="text-sm font-mono">{analytics.post_embeddings.personalized_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Mean L2 Norm</span>
                      <span className="text-sm font-mono">{analytics.post_embeddings.mean_norm.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Std Deviation</span>
                      <span className="text-sm font-mono">{analytics.post_embeddings.std_norm.toFixed(4)}</span>
                    </div>
                    
                    {/* Personalization Ratio */}
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Personalization Rate:</span>
                        <Badge variant={analytics.post_embeddings.personalized_count > 0 ? "default" : "secondary"}>
                          {analytics.post_embeddings.count > 0 
                            ? `${((analytics.post_embeddings.personalized_count / analytics.post_embeddings.count) * 100).toFixed(1)}%`
                            : '0%'
                          }
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cold Start Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Cold Start Performance</CardTitle>
              <CardDescription>
                Monitoring how quickly new content gets embedded and becomes discoverable
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.cold_start.error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{analytics.cold_start.error}</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {analytics.cold_start.recent_posts}
                      </div>
                      <div className="text-xs text-muted-foreground">Recent Posts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {analytics.cold_start.embedded_posts}
                      </div>
                      <div className="text-xs text-muted-foreground">Embedded</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getCoverageStatus(analytics.cold_start.coverage_ratio).color}`}>
                        {(analytics.cold_start.coverage_ratio * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Coverage</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {analytics.cold_start.timeframe}
                      </div>
                      <div className="text-xs text-muted-foreground">Timeframe</div>
                    </div>
                  </div>

                  {/* Coverage Status */}
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Coverage Status:</span>
                      <Badge 
                        variant={
                          analytics.cold_start.coverage_ratio >= 0.9 ? "default" :
                          analytics.cold_start.coverage_ratio >= 0.7 ? "secondary" :
                          "destructive"
                        }
                      >
                        {(() => {
                          const { status, icon: Icon } = getCoverageStatus(analytics.cold_start.coverage_ratio);
                          return (
                            <>
                              <Icon className="w-3 h-3 mr-1" />
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </>
                          );
                        })()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {analytics.cold_start.coverage_ratio >= 0.9 
                        ? "Excellent coverage - new content is being embedded quickly"
                        : analytics.cold_start.coverage_ratio >= 0.7
                        ? "Good coverage - most new content is being embedded"
                        : analytics.cold_start.coverage_ratio >= 0.5
                        ? "Warning - some new content may not be discoverable"
                        : "Critical - many new posts are not being embedded"
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}