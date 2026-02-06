'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Save, History, TestTube, RotateCcw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface ScoringWeights {
  [key: string]: number;
}

interface WeightHistory {
  history: Array<{
    id: string;
    action_type: string;
    old_weight: number;
    new_weight: number;
    weight_diff: number;
    changed_by: string;
    changed_at: string;
    change_reason?: string;
  }>;
  summary: {
    total_changes: number;
    unique_actions: number;
    changes_by_action: Record<string, {
      current_weight: number;
      previous_weight: number;
      total_changes: number;
      last_changed: string;
    }>;
  };
}

export function EnhancedWeightManagementTab() {
  const [weights, setWeights] = useState<ScoringWeights>({});
  const [originalWeights, setOriginalWeights] = useState<ScoringWeights>({});
  const [weightHistory, setWeightHistory] = useState<WeightHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');

  const fetchWeights = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/weights`);
      if (!response.ok) throw new Error('Failed to fetch weights');
      const data = await response.json();
      setWeights(data.weights || {});
      setOriginalWeights(data.weights || {});
    } catch (err) {
      setError('Failed to load scoring weights');
      console.error(err);
    }
  };

  const fetchWeightHistory = async (actionType?: string) => {
    try {
      const params = new URLSearchParams();
      if (actionType) params.append('action_type', actionType);
      
      const response = await fetch(`${API_URL}/admin/weight-history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch weight history');
      const data = await response.json();
      setWeightHistory(data);
    } catch (err) {
      console.error('Failed to load weight history:', err);
    }
  };

  useEffect(() => {
    fetchWeights();
    fetchWeightHistory();
  }, []);

  const handleWeightChange = (action: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setWeights(prev => ({ ...prev, [action]: numValue }));
    }
  };

  const saveWeights = async () => {
    setLoading(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/admin/weights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weights),
      });

      if (!response.ok) throw new Error('Failed to save weights');
      
      setSaveSuccess(true);
      setOriginalWeights(weights);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Refresh history after saving
      await fetchWeightHistory();
    } catch (err) {
      setError('Failed to save weights');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const revertToOriginal = () => {
    setWeights({ ...originalWeights });
  };

  const revertToHistoricalWeight = (action: string, weight: number) => {
    setWeights(prev => ({ ...prev, [action]: weight }));
  };

  const hasChanges = JSON.stringify(weights) !== JSON.stringify(originalWeights);

  const getWeightColor = (weight: number) => {
    if (weight > 0) return 'text-green-600';
    if (weight < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getWeightChange = (current: number, previous: number) => {
    const diff = current - previous;
    const percentChange = previous !== 0 ? (diff / Math.abs(previous)) * 100 : 0;
    return { diff, percentChange };
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Weight Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage scoring weights with history tracking and rollback capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchWeights} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={revertToOriginal}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Revert
            </Button>
          )}
          <Button size="sm" onClick={saveWeights} disabled={!hasChanges || loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            Weights saved successfully!
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="current" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="current">Current Weights</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="testing">A/B Testing</TabsTrigger>
        </TabsList>

        {/* Current Weights Tab */}
        <TabsContent value="current" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Action Scoring Weights</CardTitle>
              <CardDescription>
                Adjust weights to control recommendation ranking. Changes are tracked for audit and rollback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-green-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Positive Actions (Boost)
                  </h3>
                  {Object.entries(weights)
                    .filter(([, weight]) => weight > 0)
                    .map(([action, weight]) => (
                      <div key={action} className="space-y-2">
                        <Label htmlFor={action} className="capitalize">
                          {action.replace('_', ' ')}
                        </Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id={action}
                            type="number"
                            step="0.1"
                            value={weight}
                            onChange={(e) => handleWeightChange(action, e.target.value)}
                            className="max-w-[150px]"
                          />
                          <span className={`font-mono font-bold ${getWeightColor(weight)}`}>
                            {weight > 0 ? '+' : ''}{weight}
                          </span>
                          {weightHistory?.summary.changes_by_action[action] && (
                            <Badge variant="outline" className="text-xs">
                              {(() => {
                                const change = getWeightChange(
                                  weight,
                                  weightHistory.summary.changes_by_action[action].previous_weight
                                );
                                return (
                                  <span className={change.diff > 0 ? 'text-green-600' : change.diff < 0 ? 'text-red-600' : 'text-gray-600'}>
                                    {change.diff > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : change.diff < 0 ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
                                    {change.diff > 0 ? '+' : ''}{change.diff.toFixed(2)}
                                  </span>
                                );
                              })()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-red-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Negative Actions (Penalize)
                  </h3>
                  {Object.entries(weights)
                    .filter(([, weight]) => weight < 0)
                    .map(([action, weight]) => (
                      <div key={action} className="space-y-2">
                        <Label htmlFor={action} className="capitalize">
                          {action.replace('_', ' ')}
                        </Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id={action}
                            type="number"
                            step="0.1"
                            value={weight}
                            onChange={(e) => handleWeightChange(action, e.target.value)}
                            className="max-w-[150px]"
                          />
                          <span className={`font-mono font-bold ${getWeightColor(weight)}`}>
                            {weight}
                          </span>
                          {weightHistory?.summary.changes_by_action[action] && (
                            <Badge variant="outline" className="text-xs">
                              {(() => {
                                const change = getWeightChange(
                                  weight,
                                  weightHistory.summary.changes_by_action[action].previous_weight
                                );
                                return (
                                  <span className={change.diff > 0 ? 'text-green-600' : change.diff < 0 ? 'text-red-600' : 'text-gray-600'}>
                                    {change.diff > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : change.diff < 0 ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
                                    {change.diff > 0 ? '+' : ''}{change.diff.toFixed(2)}
                                  </span>
                                );
                              })()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">How it works:</h4>
                <p className="text-sm text-muted-foreground">
                  The final score for each post is calculated as: <code className="bg-background px-1 py-0.5 rounded">Σ(weight × probability)</code>. 
                  Higher scores mean the post is more likely to appear in the user's feed. All changes are automatically tracked for audit and rollback.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <div className="flex items-center gap-4 mb-4">
            <Label htmlFor="action-filter">Filter by Action:</Label>
            <select
              id="action-filter"
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                fetchWeightHistory(e.target.value || undefined);
              }}
              className="px-3 py-1 border rounded-md"
            >
              <option value="">All Actions</option>
              {Object.keys(weights).map(action => (
                <option key={action} value={action}>
                  {action.replace('_', ' ')}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => fetchWeightHistory(selectedAction || undefined)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* History Summary */}
          {weightHistory && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Change Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {weightHistory.summary.total_changes}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Changes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {weightHistory.summary.unique_actions}
                    </div>
                    <div className="text-sm text-muted-foreground">Actions Modified</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {weightHistory.history.length > 0 ? formatTimestamp(weightHistory.history[0].changed_at).split(',')[0] : 'N/A'}
                    </div>
                    <div className="text-sm text-muted-foreground">Last Change</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed History */}
          <Card>
            <CardHeader>
              <CardTitle>Change History</CardTitle>
              <CardDescription>
                Detailed log of all weight changes with rollback capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!weightHistory || weightHistory.history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-8 h-8 mx-auto mb-2" />
                  <p>No weight changes found</p>
                  <p className="text-sm">Changes will appear here after you modify weights</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {weightHistory.history.map((change) => (
                    <div key={change.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium capitalize">{change.action_type.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimestamp(change.changed_at)} by {change.changed_by}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{change.old_weight.toFixed(2)}</Badge>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="outline">{change.new_weight.toFixed(2)}</Badge>
                          <Badge variant={change.weight_diff > 0 ? "default" : "destructive"}>
                            {change.weight_diff > 0 ? '+' : ''}{change.weight_diff.toFixed(2)}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revertToHistoricalWeight(change.action_type, change.old_weight)}
                        title="Revert to this weight"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B Testing Tab */}
        <TabsContent value="testing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5" />
                A/B Testing (Coming Soon)
              </CardTitle>
              <CardDescription>
                Compare different weight configurations and measure their impact on user engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <TestTube className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">A/B Testing Framework</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  This feature will allow you to create weight configuration experiments, 
                  split traffic between variants, and measure engagement metrics to determine 
                  the optimal scoring weights.
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Create Experiments</h4>
                      <p className="text-sm text-muted-foreground">
                        Define weight variants and traffic allocation
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Monitor Metrics</h4>
                      <p className="text-sm text-muted-foreground">
                        Track engagement, CTR, and user satisfaction
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Statistical Analysis</h4>
                      <p className="text-sm text-muted-foreground">
                        Determine significance and winning variants
                      </p>
                    </div>
                  </div>
                  <Button disabled>
                    <TestTube className="w-4 h-4 mr-2" />
                    Create Experiment (Coming Soon)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}