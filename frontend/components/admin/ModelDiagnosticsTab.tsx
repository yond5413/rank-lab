'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Brain, BarChart3, Users, Settings, AlertTriangle, TrendingUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface ModelDiagnostics {
  scoring_weights: {
    active_weights: Record<string, number>;
    positive_actions: number;
    negative_actions: number;
    weight_range: {
      min: number;
      max: number;
      mean: number;
    };
    error?: string;
  };
  engagement_patterns: {
    total_recent_events: number;
    event_type_distribution: Record<string, number>;
    unique_active_users: number;
    avg_events_per_user: number;
    most_common_events: Array<[string, number]>;
    error?: string;
  };
  model_config: {
    embedding_dimension: number;
    max_in_network_candidates: number;
    max_oon_candidates: number;
    result_size: number;
    model_name: string;
  };
}

export function ModelDiagnosticsTab() {
  const [diagnostics, setDiagnostics] = useState<ModelDiagnostics | null>(null);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = async (userId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (userId?.trim()) {
        params.append('user_id', userId.trim());
      }

      const response = await fetch(`${API_URL}/admin/model-diagnostics?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch diagnostics: ${response.statusText}`);
      }

      const data = await response.json();
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleUserAnalysis = () => {
    fetchDiagnostics(userIdFilter);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getWeightBalance = (positiveCount: number, negativeCount: number) => {
    const total = positiveCount + negativeCount;
    if (total === 0) return { status: 'No weights', color: 'text-gray-600', variant: 'outline' as const };
    
    const ratio = positiveCount / total;
    if (ratio >= 0.4 && ratio <= 0.6) {
      return { status: 'Balanced', color: 'text-green-600', variant: 'default' as const };
    } else if (ratio > 0.6) {
      return { status: 'Positive-heavy', color: 'text-blue-600', variant: 'secondary' as const };
    } else {
      return { status: 'Negative-heavy', color: 'text-red-600', variant: 'destructive' as const };
    }
  };

  if (loading && !diagnostics) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading model diagnostics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Model Diagnostics</h3>
          <p className="text-sm text-muted-foreground">
            Analyze model predictions, scoring patterns, and potential biases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="user-filter" className="text-sm">User Analysis:</Label>
            <Input
              id="user-filter"
              placeholder="User ID (optional)"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              className="w-40"
            />
            <Button size="sm" onClick={handleUserAnalysis} disabled={loading}>
              Analyze
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchDiagnostics()} disabled={loading}>
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

      {diagnostics && (
        <>
          {/* Model Configuration Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Model Configuration
              </CardTitle>
              <CardDescription>
                Current model settings and architecture parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {diagnostics.model_config.embedding_dimension}D
                  </div>
                  <div className="text-xs text-muted-foreground">Embedding Dimension</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {diagnostics.model_config.max_in_network_candidates}
                  </div>
                  <div className="text-xs text-muted-foreground">In-Network Candidates</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {diagnostics.model_config.max_oon_candidates}
                  </div>
                  <div className="text-xs text-muted-foreground">OON Candidates</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {diagnostics.model_config.result_size}
                  </div>
                  <div className="text-xs text-muted-foreground">Final Results</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-600">
                    MiniLM-L6-v2
                  </div>
                  <div className="text-xs text-muted-foreground">Base Model</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scoring Weight Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Scoring Weight Analysis
                </CardTitle>
                <CardDescription>
                  Current weight distribution and balance analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {diagnostics.scoring_weights.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{diagnostics.scoring_weights.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {/* Weight Balance Overview */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {diagnostics.scoring_weights.positive_actions}
                        </div>
                        <div className="text-xs text-muted-foreground">Positive Actions</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">
                          {diagnostics.scoring_weights.negative_actions}
                        </div>
                        <div className="text-xs text-muted-foreground">Negative Actions</div>
                      </div>
                      <div>
                        <Badge variant={getWeightBalance(
                          diagnostics.scoring_weights.positive_actions,
                          diagnostics.scoring_weights.negative_actions
                        ).variant}>
                          {getWeightBalance(
                            diagnostics.scoring_weights.positive_actions,
                            diagnostics.scoring_weights.negative_actions
                          ).status}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">Balance</div>
                      </div>
                    </div>

                    {/* Weight Range */}
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-3">Weight Distribution</div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Minimum</span>
                          <span className="font-mono text-sm">{diagnostics.scoring_weights.weight_range.min.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Maximum</span>
                          <span className="font-mono text-sm">{diagnostics.scoring_weights.weight_range.max.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Mean</span>
                          <span className="font-mono text-sm">{diagnostics.scoring_weights.weight_range.mean.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Active Weights */}
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-3">Active Weights</div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {Object.entries(diagnostics.scoring_weights.active_weights).map(([action, weight]) => (
                          <div key={action} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{action.replace('_', ' ')}</span>
                            <Badge variant={weight > 0 ? "default" : "destructive"}>
                              {weight > 0 ? '+' : ''}{weight.toFixed(2)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Engagement Pattern Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Engagement Patterns
                </CardTitle>
                <CardDescription>
                  User interaction patterns and behavior analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {diagnostics.engagement_patterns.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{diagnostics.engagement_patterns.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatNumber(diagnostics.engagement_patterns.total_recent_events)}
                        </div>
                        <div className="text-xs text-muted-foreground">Recent Events</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatNumber(diagnostics.engagement_patterns.unique_active_users)}
                        </div>
                        <div className="text-xs text-muted-foreground">Active Users</div>
                      </div>
                    </div>

                    {/* Average Events per User */}
                    <div className="text-center pt-2 border-t">
                      <div className="text-lg font-bold text-purple-600">
                        {diagnostics.engagement_patterns.avg_events_per_user.toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg Events per User</div>
                    </div>

                    {/* Event Type Distribution */}
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-3">Event Distribution</div>
                      <div className="space-y-2">
                        {Object.entries(diagnostics.engagement_patterns.event_type_distribution)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 5)
                          .map(([eventType, percentage]) => (
                          <div key={eventType} className="flex items-center gap-3">
                            <div className="text-sm capitalize w-20">{eventType.replace('_', ' ')}</div>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div 
                                className="h-full bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${percentage * 100}%` }}
                              />
                            </div>
                            <div className="text-xs font-mono w-12 text-right">
                              {(percentage * 100).toFixed(1)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Most Common Events */}
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-3">Top Events</div>
                      <div className="space-y-1">
                        {diagnostics.engagement_patterns.most_common_events.slice(0, 3).map(([event, count], index) => (
                          <div key={event} className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{index + 1}</Badge>
                              <span className="text-sm capitalize">{event.replace('_', ' ')}</span>
                            </div>
                            <span className="font-mono text-sm">{formatNumber(count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Model Health Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Model Health Assessment
              </CardTitle>
              <CardDescription>
                Overall model performance and potential issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Health Indicators */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="font-medium">Weight Balance</span>
                    </div>
                    <Badge variant={getWeightBalance(
                      diagnostics.scoring_weights.positive_actions,
                      diagnostics.scoring_weights.negative_actions
                    ).variant}>
                      {getWeightBalance(
                        diagnostics.scoring_weights.positive_actions,
                        diagnostics.scoring_weights.negative_actions
                      ).status}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {diagnostics.scoring_weights.positive_actions + diagnostics.scoring_weights.negative_actions} total weights
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">User Activity</span>
                    </div>
                    <Badge variant={diagnostics.engagement_patterns.unique_active_users > 10 ? "default" : "secondary"}>
                      {diagnostics.engagement_patterns.unique_active_users > 10 ? "Active" : "Low"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatNumber(diagnostics.engagement_patterns.unique_active_users)} active users
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                      <span className="font-medium">Event Volume</span>
                    </div>
                    <Badge variant={diagnostics.engagement_patterns.total_recent_events > 100 ? "default" : "secondary"}>
                      {diagnostics.engagement_patterns.total_recent_events > 100 ? "High" : "Low"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatNumber(diagnostics.engagement_patterns.total_recent_events)} recent events
                    </p>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="pt-4 border-t">
                  <div className="text-sm font-medium mb-3">Recommendations</div>
                  <div className="space-y-2">
                    {diagnostics.engagement_patterns.unique_active_users < 10 && (
                      <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          <strong>Low User Activity:</strong> Consider strategies to increase user engagement for better model training.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {diagnostics.scoring_weights.positive_actions === 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          <strong>No Positive Weights:</strong> Model may be overly pessimistic. Add positive action weights.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {diagnostics.engagement_patterns.avg_events_per_user < 2 && (
                      <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          <strong>Low Engagement Rate:</strong> Users are not interacting frequently. Consider improving content quality or recommendation relevance.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}