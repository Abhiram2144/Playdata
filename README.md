[comment]: # (You may find the following markdown cheat sheet useful: https://www.markdownguide.org/cheat-sheet/. You may also consider using an online Markdown editor such as StackEdit.) 

## Project title: *PlayData - Web App for Esports Data Analysis*

### Student name: *Abhiram Sathiraju*

### Student email: *as1809@student.le.ac.uk*

### Project description: 
*PlayData is an AI-powered educational web platform that transforms esports datasets into interactive mathematics learning experiences. The platform allows teachers to import esports data, create visualisations such as charts and graphs, and generate quizzes based on real-world statistics. Students can join live classroom sessions, analyse visualised data, answer questions, and receive instant feedback with AI-generated explanations. The system integrates artificial intelligence to assist teachers with quiz creation, natural language data exploration, and post-session learning analytics. By combining esports, data visualisation, gamification, and AI, PlayData aims to increase student engagement while improving understanding of mathematical concepts such as averages, distributions, trends, and correlations. The platform also provides teachers with analytics dashboards and automated lesson summaries, reducing preparation time and supporting data-driven teaching. PlayData demonstrates how real-world esports data can be used as an engaging and effective tool for mathematics education.*

### List of requirements (objectives):

## Essential:

- Implement secure authentication, authorization, and role-based access control for Teachers, Students, and Administrators.
- Develop administrative functionality for managing user accounts, system settings, and approved Google Drive dataset connections.
- Enable teachers to connect, import, preview, manage, and cache esports datasets from Google Drive.
- Develop a visualisation builder supporting multiple chart types, configurable chart settings, and reusable visualisation templates.
- Implement quiz creation functionality supporting both manual question creation and dataset-linked assessments.
- Develop live classroom sessions where teachers can share visualisations, publish quizzes, and monitor participation in real time.
- Provide a student interface for joining sessions, viewing visualisations, submitting answers, receiving feedback, and tracking progress.
- Implement real-time communication between teachers and students using WebSocket technology.
- Store and manage datasets, visualisations, quizzes, session data, and student responses within a database.
- Provide analytics dashboards showing student performance (By class or By Student), response statistics, and learning outcomes.
- Enable export of session results and analytics reports.
- Deploy the completed platform as a fully functional web application.

## Desirable:

- Integrate OpenAI to automatically generate mathematics-based quiz questions from esports datasets.
- Implement a natural-language data exploration assistant for teachers using AI.
- Provide AI-generated explanations and feedback for student responses.
- Generate AI-assisted post-session summaries and learning analytics reports.
- Support responsive design across desktop, tablet, and mobile devices.
- Provide historical tracking of sessions, quizzes, and student performance.

## Optional:

- Integrate the platform with Blackboard and other Learning Management Systems using LTI standards.
- Implement adaptive learning features that personalise quiz difficulty based on student performance.
- Add gamification features such as badges, achievements, and leaderboards.
- Support additional dataset sources and educational subjects beyond esports and mathematics.
- Provide AI-generated lesson plans and personalised learning recommendations.

## Challenging Features for me as per the current requirements: 
- Figuring out how I can utilise the AI powers in the web app
- API cost management (efficiently sending API requests by Prompt Engineering)
- Natural Language Data Exploration Assistant for teachers is fascinating yet challenging.
- Analytics Dashboard for teachers is quite complex considering that im providing per student review. 

### Tech Stack: 
- NextJS - Frontend and Server
- UI Components - ShadCN and Mantine UI
- OpenAI API - AI
- Supabase - Backend and Authentication
- Socket.io - Web Sockets
- Vercel - Deployment