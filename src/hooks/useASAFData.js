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

  // Track the current project to detect changes (initialize as null, not selectedProject)
  const currentProjectRef = useRef(null);

  // Track if we've fetched once (for WebSocket reconnect handling)
  const hasFetchedRef = useRef(false);

  // Track the project path of the in-flight request
  const inFlightProjectPathRef = useRef(null);

  /**
   * Fetch sprint data from API
   * Uses AbortController to cancel in-flight requests
   */
  const fetchSprintData = useCallback(async (project) => {
    // No project selected
    if (!project?.fullPath && !project?.path && !project?.name) {
      setSprintData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Get the project path for this request
    const newProjectPath = project.fullPath || project.path || project.name;

    console.log('[useASAFData] fetchSprintData called:', {
      newProjectPath,
      inFlightPath: inFlightProjectPathRef.current,
      hasAbortController: !!abortControllerRef.current
    });

    // If there's already a request in flight for the SAME project, don't abort it
    if (inFlightProjectPathRef.current === newProjectPath) {
      console.log('[useASAFData] Request already in flight for this project, skipping');
      return;
    }

    // Cancel any in-flight request for a DIFFERENT project
    if (abortControllerRef.current && inFlightProjectPathRef.current !== newProjectPath) {
      console.log('[useASAFData] Aborting request for different project:', {
        oldPath: inFlightProjectPathRef.current,
        newPath: newProjectPath
      });
      abortControllerRef.current.abort();
    }

    // Track this request
    inFlightProjectPathRef.current = newProjectPath;
    console.log('[useASAFData] Starting new request for:', newProjectPath);

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      // Use the correct path property
      const rawPath = project.path || project.fullPath || project.name;

      console.log('[useASAFData] Path resolution:', {
        'project.path': project.path,
        'project.fullPath': project.fullPath,
        'project.name': project.name,
        'rawPath': rawPath
      });

      // Encode project path for URL (replace / with -)
      const encodedPath = rawPath.replace(/\//g, '-');

      console.log('[useASAFData] Fetching:', {
        encodedPath,
        url: `/api/asaf/${encodedPath}`
      });

      // Fetch sprint data
      const response = await fetch(`/api/asaf/${encodedPath}`, {
        signal: abortController.signal,
        cache: 'no-store',
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

      console.log('[useASAFData] Response:', data);

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
      // Ignore abort errors - don't change state
      if (err.name === 'AbortError') {
        console.log('[useASAFData] Request aborted, NOT changing state');
        // Clean up refs but don't update state - let the new request handle it
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          inFlightProjectPathRef.current = null;
        }
        return;
      }

      console.error('[useASAFData] Error fetching ASAF data:', err);
      setError(err.message || 'Failed to load ASAF data');
      setSprintData(null);

    } finally {
      console.log('[useASAFData] Finally block, cleaning up');
      // Clean up if this is still the current request (and wasn't aborted)
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        abortControllerRef.current = null;
        inFlightProjectPathRef.current = null;
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
    console.log('[useASAFData] useEffect triggered:', {
      selectedProject,
      currentProject: currentProjectRef.current
    });

    // Always fetch if we have a project (handles initial mount)
    if (selectedProject) {
      // Detect project change (compare by fullPath, path, or name)
      const projectChanged =
        !currentProjectRef.current ||
        currentProjectRef.current?.fullPath !== selectedProject?.fullPath ||
        currentProjectRef.current?.path !== selectedProject?.path ||
        currentProjectRef.current?.name !== selectedProject?.name;

      console.log('[useASAFData] projectChanged:', projectChanged);

      if (projectChanged) {
        currentProjectRef.current = selectedProject;
        console.log('[useASAFData] Calling fetchSprintData from PROJECT CHANGE');
        fetchSprintData(selectedProject);
      }
    }
  }, [selectedProject, fetchSprintData]);

  // Handle WebSocket reconnection
  useEffect(() => {
    // Re-fetch data when WebSocket reconnects after we've fetched at least once
    if (isConnected && hasFetchedRef.current && selectedProject) {
      console.log('[useASAFData] Calling fetchSprintData from WEBSOCKET RECONNECTION');
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
      const currentPath = (selectedProject.fullPath || selectedProject.path)?.replace(/\\/g, '/');

      if (messagePath === currentPath) {
        console.log('[useASAFData] Calling fetchSprintData from WEBSOCKET MESSAGE');
        fetchSprintData(selectedProject);
      }
    }
  }, [messages, selectedProject, fetchSprintData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any in-flight requests when component unmounts
      console.log('[useASAFData] Component unmounting, aborting requests');
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