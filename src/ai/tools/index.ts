import { AiTool } from '@/types/ai'
import { findProjectTool, getProjectOverviewTool, listProjectsTool, createProjectTool, updateProjectTool, updateEntityStatusTool } from './projectsTools'
import { findClientTool, createClientTool, updateClientTool, findContactTool, createContactTool, updateContactTool } from './clientsTools'
import { findIncidentTool, listIncidentsTool, createIncidentTool } from './incidentsTools'
import { findUserTool, bulkReassignProjectsTool } from './usersTools'
import { listPhasesTool, listTasksTool, createTaskTool, updateTaskTool, convertToSubtaskTool, promoteSubtaskTool } from './tasksTools'
import { generateStatusReportMarkdownTool } from './reportTools'
import { proposeExtractedItemsTool } from './extractionTools'

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
  findUserTool,
  bulkReassignProjectsTool,
  listPhasesTool,
  listTasksTool,
  createTaskTool,
  updateTaskTool,
  convertToSubtaskTool,
  promoteSubtaskTool,
  generateStatusReportMarkdownTool,
  proposeExtractedItemsTool,
]

export const TOOLS_BY_NAME: Record<string, AiTool> = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]))
