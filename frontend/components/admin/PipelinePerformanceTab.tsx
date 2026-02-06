'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Activity, Clock, TrendingUp, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface PipelineMetrics {
  throughput: {
    total_events: number;
    events_per_hour: number;
    timeframe: string;
    hourly_distribution: Record<string, number>;
    error?: string;
  };
  system_health: {
    recent_user_embedding_updates: number;
    recent_post_embedding_updates: number;
    embedding_update_rate: number;
    status: 'healthy' | 'warning' | 'critical';
    error?: string;
  };
}

export function PipelinePerformanceTab() {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [timeframe, setTimeframe] = useState('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = async (selectedTimeframe: string = timeframe) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/admin/pipeline-performance?timeframe=${selectedTimeframe}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, timeframe]);

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
    fetchMetrics(newTimeframe);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getHealthStatus = (status: string) => {
    switch (status) {
      case 'healthy':
        return { color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle, variant: 'default' as const };
      case 'warning':
        return { color: 'text-yellow-600', bg: 'bg-yellow-50', icon: AlertTriangle, variant: 'secondary' as const };
      case 'critical':
        return { color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle, variant: 'destructive' as const };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-50', icon: AlertTriangle, variant: 'outline' as const };
    }
  };

  const getHourlyChartData = (distribution: Record<string, number>) => {
    const entries = Object.entries(distribution).sort();
    const maxValue = Math.max(...Object.values(distribution));
    
    return entries.map(([hour, count]) => ({
      hour: hour.split(' ')[1] || hour, // Extract just the hour part
      count,
      percentage: maxValue > 0 ? (count / maxValue) * 100 : 0
    }));
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading performance metrics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Pipeline Performance</h3>
          <p className="text-sm text-muted-foreground">
            Real-time monitoring of recommendation pipeline throughput and health
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Manual'}
          </Button>
          <Tabs value={timeframe} onValueChange={handleTimeframeChange}>
            <TabsList>
              <TabsTrigger value="1h">1H</TabsTrigger>
              <TabsTrigger value="24h">24H</TabsTrigger>
              <TabsTrigger value="7d">7D</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => fetchMetrics()} disabled={loading}>
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

      {metrics && (
        <>
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* System Health */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Health</CardTitle>
                {(() => {
                  const { icon: Icon } = getHealthStatus(metrics.system_health.status);
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()}
              </CardHeader>
              <CardContent>
                <Badge variant={getHealthStatus(metrics.system_health.status).variant}>
                  {metrics.system_health.status.charAt(0).toUpperCase() + metrics.system_health.status.slice(1)}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.system_health.embedding_update_rate.toFixed(1)} updates/hour
                </p>
              </CardContent>
            </Card>

            {/* Throughput */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Throughput</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(metrics.throughput.events_per_hour)}/h
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(metrics.throughput.total_events)} total events
                </p>
              </CardContent>
            </Card>

            {/* User Embeddings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User Updates</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(metrics.system_health.recent_user_embedding_updates)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last {metrics.throughput.timeframe}
                </p>
              </CardContent>
            </Card>

            {/* Post Embeddings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Post Updates</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(metrics.system_health.recent_post_embedding_updates)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last {metrics.throughput.timeframe}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Throughput Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Throughput Analysis</CardTitle>
                <CardDescription>
                  Engagement event processing over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.throughput.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{metrics.throughput.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Total Events</div>
                        <div className="text-2xl font-bold">{formatNumber(metrics.throughput.total_events)}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Events/Hour</div>
                        <div className="text-2xl font-bold">{metrics.throughput.events_per_hour.toFixed(1)}</div>
                      </div>
                    </div>

                    {/* Hourly Distribution Chart */}
                    {Object.keys(metrics.throughput.hourly_distribution).length > 0 && (
                      <div className="mt-6">
                        <div className="text-sm font-medium mb-3">Hourly Distribution</div>
                        <div className="space-y-2">
                          {getHourlyChartData(metrics.throughput.hourly_distribution).slice(-12).map((item) => (
                            <div key={item.hour} className="flex items-center gap-3">
                              <div className="text-xs font-mono w-12 text-muted-foreground">
                                {item.hour}
                              </div>
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div 
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                              <div className="text-xs font-mono w-12 text-right">
                                {item.count}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Health Details */}
            <Card>
              <CardHeader>
                <CardTitle>System Health Details</CardTitle>
                <CardDescription>
                  Embedding update activity and system status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.system_health.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{metrics.system_health.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {/* Health Status */}
                    <div className={`p-4 rounded-lg ${getHealthStatus(metrics.system_health.status).bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {(() => {
                          const { icon: Icon, color } = getHealthStatus(metrics.system_health.status);
                          return <Icon className={`w-5 h-5 ${color}`} />;
                        })()}
                        <span className="font-semibold">
                          {metrics.system_health.status.charAt(0).toUpperCase() + metrics.system_health.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {metrics.system_health.status === 'healthy' 
                          ? "All systems operating normally with regular embedding updates"
                          : metrics.system_health.status === 'warning'
                          ? "Some embedding updates detected, monitoring recommended"
                          : "No recent embedding updates detected, investigation required"
                        }
                      </p>
                    </div>

                    {/* Update Metrics */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">User Embedding Updates</span>
                        <span className="text-sm font-mono">{metrics.system_health.recent_user_embedding_updates}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Post Embedding Updates</span>
                        <span className="text-sm font-mono">{metrics.system_health.recent_post_embedding_updates}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Update Rate</span>
                        <span className="text-sm font-mono">{metrics.system_health.embedding_update_rate.toFixed(2)}/hour</span>
                      </div>
                    </div>

                    {/* Performance Indicators */}
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-2">Performance Indicators</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Badge variant={metrics.throughput.events_per_hour > 10 ? "default" : "secondary"}>
                          {metrics.throughput.events_per_hour > 10 ? "Active" : "Low"} Throughput
                        </Badge>
                        <Badge variant={metrics.system_health.embedding_update_rate > 1 ? "default" : "secondary"}>
                          {metrics.system_health.embedding_update_rate > 1 ? "Active" : "Low"} Learning
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Performance Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Recommendations</CardTitle>
              <CardDescription>
                Suggestions for optimizing pipeline performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics.throughput.events_per_hour < 5 && (
                  <Alert>
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Low Throughput:</strong> Consider increasing user engagement or checking for system bottlenecks.
                    </AlertDescription>
                  </Alert>
                )}
                
                {metrics.system_health.embedding_update_rate < 1 && (
                  <Alert>
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Low Learning Rate:</strong> Embedding updates are infrequent. Check online learning pipeline.
                    </AlertDescription>
                  </Alert>
                )}
                
                {metrics.system_health.status === 'healthy' && metrics.throughput.events_per_hour > 50 && (
                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Optimal Performance:</strong> System is processing events efficiently with regular learning updates.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}