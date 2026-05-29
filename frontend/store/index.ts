import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";

// Auth slice
type User = { id: string; name: string; email: string } | null;
const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null as User,
    token: null as string | null,
    isAuthenticated: false,
  },
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
    },
  },
});

// Projects slice
type Project = { id: string; name: string; status?: string; taskCount?: number };
const projectsSlice = createSlice({
  name: "projects",
  initialState: {
    list: [] as Project[],
    current: null as Project | null,
  },
  reducers: {
    setProjects(state, action: PayloadAction<Project[]>) {
      state.list = action.payload;
    },
    setCurrentProject(state, action: PayloadAction<Project | null>) {
      state.current = action.payload;
    },
  },
});

// Tasks slice
type Task = {
  id: string;
  title: string;
  status: string;
  assignee?: { id: string; name: string; avatarUrl?: string } | null;
  storyPoints?: number;
  aiEstimate?: number;
};
const tasksSlice = createSlice({
  name: "tasks",
  initialState: {
    list: [] as Task[],
    currentTask: null as Task | null,
    loading: false,
    error: null as string | null,
  },
  reducers: {
    setTasks(state, action: PayloadAction<Task[]>) {
      state.list = action.payload;
    },
    setCurrentTask(state, action: PayloadAction<Task | null>) {
      state.currentTask = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    updateTask(state, action: PayloadAction<Task>) {
      const idx = state.list.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) state.list[idx] = action.payload;
    },
  },
});

export const { setUser, setToken, logout } = authSlice.actions;
export const { setProjects, setCurrentProject } = projectsSlice.actions;
export const { setTasks, setCurrentTask, setLoading, setError, updateTask } =
  tasksSlice.actions;

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    projects: projectsSlice.reducer,
    tasks: tasksSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
