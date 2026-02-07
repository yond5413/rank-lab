'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Sliders, 
  Activity, 
  Database, 
  Brain, 
  TestTube, 
  Zap, 
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

// Import the new comprehensive admin components
import { AttentionVerificationTab } from '@/components/admin/AttentionVerificationTab';
import { EmbeddingAnalyticsTab } from '@/components/admin/EmbeddingAnalyticsTab';
import { PipelinePerformanceTab } from '@/components/admin/PipelinePerformanceTab';
import { ModelDiagnosticsTab } from '@/components/admin/ModelDiagnosticsTab';
import { EnhancedWeightManagementTab } from '@/components/admin/EnhancedWeightManagementTab';
import { AlertSystem } from '@/components/admin/AlertSystem';

import { adminFetch } from '@/lib/adminApi';
import { formatAdminDate } from '@/lib/adminDateFormat';

interface SystemStats {
  user_embeddings?: number;
  post_embeddings?: number;
  engagement_events?: number;
  error?: string;
}

interface SystemHealth {
  overall_status: 'healthy' | 'warning' | 'critical';
  services: {
    pipeline: 'ok' | 'warning' | 'error';
    embeddings: 'ok' | 'warning' | 'error';
    scoring: 'ok' | 'warning' | 'error';
  };
  last_updated: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats>({});
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<SystemStats>('/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError('Failed to load system stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemHealth = async () => {
    try {
      const healthData = await adminFetch<SystemHealth>('/health');
      setHealth(healthData);
    } catch (err) {
      console.error('Failed to load system health:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSystemHealth();
  }, []);

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'critical':
      case 'error':
        return AlertTriangle;
      default:
        return AlertTriangle;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Recommendation System Admin</h1>
            <p className="text-muted-foreground">
              Comprehensive monitoring and management for the recommendation pipeline
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back to Home</Link>
            </Button>
            {health && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = getHealthIcon(health.overall_status);
                    return <Icon className={`w-5 h-5 ${getHealthColor(health.overall_status)}`} />;
                  })()}
                  <Badge variant={health.overall_status === 'healthy' ? 'default' : health.overall_status === 'warning' ? 'secondary' : 'destructive'}>
                    System {health.overall_status}
                  </Badge>
                </div>
                {alertCount > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <Badge variant="destructive">
                      {alertCount} Alert{alertCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh All
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">User Embeddings</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.user_embeddings?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Personalized vectors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Post Embeddings</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.post_embeddings?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Indexed content
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.engagement_events?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Tracked interactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Status</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={health?.overall_status === 'healthy' ? 'default' : 'secondary'}>
              {health?.overall_status || 'Unknown'}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Overall health
            </p>
          </CardContent>
        </Card>
      </div>

        {/* Alert System */}
        <AlertSystem onAlertsChange={(alerts) => {
          const unacknowledged = alerts.filter(alert => !alert.acknowledged).length;
          setAlertCount(unacknowledged);
        }} />

        {/* Main Tabs */}
        <Tabs defaultValue="weights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 max-w-4xl">
            <TabsTrigger value="weights" className="flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Weights
            </TabsTrigger>
            <TabsTrigger value="attention" className="flex items-center gap-2">
              <TestTube className="w-4 h-4" />
              Attention
            </TabsTrigger>
            <TabsTrigger value="embeddings" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Embeddings
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Diagnostics
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              System
            </TabsTrigger>
          </TabsList>

        {/* Enhanced Weight Management */}
        <TabsContent value="weights">
          <EnhancedWeightManagementTab />
        </TabsContent>

        {/* Attention Verification */}
        <TabsContent value="attention">
          <AttentionVerificationTab />
        </TabsContent>

        {/* Embedding Analytics */}
        <TabsContent value="embeddings">
          <EmbeddingAnalyticsTab />
        </TabsContent>

        {/* Pipeline Performance */}
        <TabsContent value="performance">
          <PipelinePerformanceTab />
        </TabsContent>

        {/* Model Diagnostics */}
        <TabsContent value="diagnostics">
          <ModelDiagnosticsTab />
        </TabsContent>

        {/* System Stats */}
        <TabsContent value="stats" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  User Embeddings
                </CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.user_embeddings?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Personalized user vectors
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Post Embeddings
                </CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.post_embeddings?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Indexed post vectors
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Engagement Events
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.engagement_events?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tracked interactions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* System Health Details */}
          {health && (
            <Card>
              <CardHeader>
                <CardTitle>System Health Details</CardTitle>
                <CardDescription>
                  Detailed status of all system components
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(health.services).map(([service, status]) => {
                    const Icon = getHealthIcon(status);
                    return (
                      <div key={service} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Icon className={`w-5 h-5 ${getHealthColor(status)}`} />
                        <div>
                          <p className="font-medium capitalize">{service}</p>
                          <Badge variant={status === 'ok' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}>
                            {status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Last updated: {formatAdminDate(health.last_updated)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Current model and pipeline configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground">Base Model</Label>
                  <p className="font-medium">sentence-transformers/all-MiniLM-L6-v2</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Embedding Dimension</Label>
                  <p className="font-medium">128 dimensions</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Max In-Network</Label>
                  <p className="font-medium">300 candidates</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Max Out-of-Network</Label>
                  <p className="font-medium">300 candidates</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Result Size</Label>
                  <p className="font-medium">30 posts</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Max Post Age</Label>
                  <p className="font-medium">7 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
