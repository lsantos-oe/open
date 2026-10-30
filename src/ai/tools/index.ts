import { AiTool } from '@/types/ai'
import { findProjectTool, createProjectTool, updateProjectTool, updateEntityStatusTool } from './projectsTools'
import { findClientTool, createClientTool, updateClientTool, findContactTool, createContactTool, updateContactTool } from './clientsTools'
import { findIncidentTool, createIncidentTool, updateIncidentTool } from './incidentsTools'
import { findUserTool, bulkReassignProjectsTool } from './usersTools'
import { listPhasesTool, createTaskTool, updateTaskTool, reorderTaskTool, convertToSubtaskTool, promoteSubtaskTool } from './tasksTools'
import { generateStatusReportMarkdownTool } from './reportTools'
import { proposeExtractedItemsTool } from './extractionTools'
import { rememberTool, forgetTool } from './memoryTools'
import { listDocumentationTool, readDocumentationTool } from './documentationTools'
import {
  listTasksTool, searchTasksTool, getTaskTool, getProjectOverviewTool, getProjectDetailsTool, listProjectsTool, workloadTool,
  listIncidentsTool, getIncidentDetailsTool, listClientsTool, getClientDetailsTool, listOpenPointsTool, searchKnowledgeTool, listUsersTool,
} from './insightsTools'

export const ALL_TOOLS: AiTool[] = [
  findProjectTool,
  getProjectOverviewTool,
  listProjectsTool,
  createProjectTool,
  updateProjectTool,
  updateEntityStatusTool,
  findClientTool,
  createClientTool,
  updateClientTool,
  findContactTool,
  createContactTool,
  updateContactTool,
  findIncidentTool,
  listIncidentsTool,
  createIncidentTool,
  updateIncidentTool,
  findUserTool,
  bulkReassignProjectsTool,
  listPhasesTool,
  listTasksTool,
  createTaskTool,
  updateTaskTool,
  reorderTaskTool,
  convertToSubtaskTool,
  promoteSubtaskTool,
  generateStatusReportMarkdownTool,
  proposeExtractedItemsTool,
  searchTasksTool,
  getTaskTool,
  getProjectDetailsTool,
  workloadTool,
  getIncidentDetailsTool,
  listClientsTool,
  getClientDetailsTool,
  listOpenPointsTool,
  searchKnowledgeTool,
  listUsersTool,
  listDocumentationTool,
  readDocumentationTool,
  rememberTool,
  forgetTool,
]

export const TOOLS_BY_NAME: Record<string, AiTool> = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]))
