export interface Slide {
    slide_number: number;
    heading: string;
    content: string;
    trick: string;
    character_dialogue: string;
    visual_theme: {
    primary_color: string;
    layout_style: string;
    illustration_prompt: string;
    };
}

export interface QuizQuestion {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
}

export interface LessonQuestion extends QuizQuestion {}

export interface DiagramItem {
    title: string;
    description: string;
    prompt_for_visual: string;
    svg_markup?: string;
}

export interface FullLessonContentJSON {
    summary: string;
    slides: Slide[];
    diagrams: DiagramItem[];
    quiz: QuizQuestion[];
    exam: LessonQuestion[];
    homework: LessonQuestion[];
    pdf_summary_url?: string;
}

export interface ProcessCurriculumDTO {
    subject_id: string;
    raw_curriculum_text: string;
}

export interface Lesson {
    id: string;
    subject_id: string;
    unit_title: string;
    chapter_name?: string;
    lesson_title: string;
    difficulty: 'سهل' | 'متوسط' | 'صعب';
    duration_minutes: number;
    points_reward: number;
    coins_cost: number;
    order_index?: number;
    content_json: FullLessonContentJSON;
    created_at?: string;
}