/**
 * useASAFData Hook
 * ================
 *
 * Custom hook for fetching ASAF sprint data and subscribing to WebSocket updates.
 * Handles loading states, error handling, automatic re-fetching on WebSocket events,
 * and cleanup of in-flight requests.
 *
 * Edge Cases Handled:
 * - Rapid project switching (AbortController cancellation)
 * - WebSocket reconnection (auto re-fetch)
 * - API timeouts and errors
 * - No sprint exists (null data)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { api } from '../utils/api';

/**
 * Fetch ASAF sprint data for a project
 * @param {Object} selectedProject - Currently selected project
 * @returns {Object} Sprint data, loading state, error state, and refresh function
 */
export function useASAFData(selectedProject) {
  const [sprintData, setSprintData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // WebSocket context for real-time updates
  const { ws, isConnected, messages } = useWebSocketContext();

  // Abort controller for cancelling in-flight requests
  const abortControllerRef = useRef(null);

  // Track the current project to detect changes
  const currentProjectRef = useRef(selectedProject);

  // Track if we've fetched once (for WebSocket reconnect handling)
  const hasFetchedRef = useRef(false);

  /**
   * Fetch sprint data from API
   * Uses AbortController to cancel in-flight requests
   */
  const fetchSprintData = useCallback(async (project) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // No project selected
    if (!project?.name) {
      setSprintData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      // Encode project path for URL (replace / with -)
      const encodedPath = project.name.replace(/\//g, '-');

      // Fetch sprint data
      const response = await fetch(`/api/asaf/${encodedPath}`, {
        signal: abortController.signal,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
        }
      });

      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      // Handle API errors
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied to ASAF data');
        }
        if (response.status === 500) {
          throw new Error('Server error while loading ASAF data');
        }
        throw new Error(`Failed to load ASAF data (${response.status})`);
      }

      const data = await response.json();

      // Check if request was aborted during JSON parsing
      if (abortController.signal.aborted) {
        return;
      }

      // Update state based on response
      if (data.exists) {
        setSprintData(data);
        setError(null);
      } else {
        // No sprint exists or corrupted structure
        setSprintData(null);
        setError(data.error || null);
      }

      hasFetchedRef.current = true;

    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError') {
        return;
      }

      console.error('Error fetching ASAF data:', err);
      setError(err.message || 'Failed to load ASAF data');
      setSprintData(null);

    } finally {
      // Clean up if this is still the current request
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, []);

  /**
   * Manual refresh function
   * Can be called by components to retry after errors
   */
  const refreshData = useCallback(() => {
    if (selectedProject) {
      fetchSprintData(selectedProject);
    }
  }, [selectedProject, fetchSprintData]);

  // Fetch data when project changes
  useEffect(() => {
    // Detect project change
    const projectChanged = currentProjectRef.current?.name !== selectedProject?.name;

    if (projectChanged) {
      currentProjectRef.current = selectedProject;
      fetchSprintData(selectedProject);
    }
  }, [selectedProject, fetchSprintData]);

  // Handle WebSocket reconnection
  useEffect(() => {
    // Re-fetch data when WebSocket reconnects after we've fetched at least once
    if (isConnected && hasFetchedRef.current && selectedProject) {
      console.log('WebSocket reconnected, refreshing ASAF data');
      fetchSprintData(selectedProject);
    }
  }, [isConnected, selectedProject, fetchSprintData]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!ws || !selectedProject || messages.length === 0) {
      return;
    }

    // Get the latest message
    const latestMessage = messages[messages.length - 1];

    // Check if it's an ASAF update for our current project
    if (latestMessage?.type === 'asaf:updated') {
      // Normalize paths for comparison
      const messagePath = latestMessage.projectPath?.replace(/\\/g, '/');
      const currentPath = selectedProject.path?.replace(/\\/g, '/');

      if (messagePath === currentPath) {
        console.log('ASAF update received for current project, refreshing');
        fetchSprintData(selectedProject);
      }
    }
  }, [messages, selectedProject, fetchSprintData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any in-flight requests when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    sprintData,
    isLoading,
    error,
    refreshData
  };
}

export default useASAFData;