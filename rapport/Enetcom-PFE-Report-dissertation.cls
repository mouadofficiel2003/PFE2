\usepackage{silence}
\WarningsOff*
\LoadClassWithOptions{report}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Packages to use
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\usepackage[a4paper,left=3cm,right=2.5cm,top=2.5cm,bottom=2.5cm]{geometry}
\usepackage{environ}
\usepackage{verse}
\usepackage[table]{xcolor}
\usepackage[explicit]{titlesec}
\usepackage{chngcntr}
\usepackage{fancyhdr}
\usepackage{caption}
\usepackage{subcaption}
\usepackage[hidelinks]{hyperref}
\usepackage{needspace} % http://ctan.org/pkg/needspace
\usepackage{pdfpages}
\usepackage{chngcntr}
\usepackage{enumitem}
\usepackage[bottom]{footmisc}
\usepackage[french]{babel}
\usepackage{varioref}
\usepackage{acronym}
\usepackage{minitoc}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[most]{tcolorbox}
\usepackage[french]{babel}
\usepackage{varioref}
\usepackage[export]{adjustbox}
\usepackage{setspace}
% minted nécessite -shell-escape ; activé plus tard si besoin de code coloré
% \usepackage{minted}
\usepackage{color}
\usepackage{tabularx}
\usepackage{ctable}
\usepackage{graphicx}
\usepackage{multirow}
\usepackage{tikz}
\usepackage{seqsplit}
\usepackage{fontenc}
\usepackage{wrapfig}
\usepackage{setspace}
\usepackage[all]{nowidow}
\usepackage{acronym}
\usepackage{array,ragged2e} % ragged2e for justification
\usepackage{xcolor}
\usepackage[titletoc,title]{appendix}
\usepackage{hyphenat} % Add hyphenat package

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Include probable needed packages
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\usepackage{siunitx} 
\sisetup{mode=math, range-phrase=--, range-units=single}
\DeclareSIUnit{\rms}{\ped{RMS}}
\DeclareSIUnit[quantity-product = ]\percent{\char`\%}
\ifdefined\DeclareUnicodeCharacter
\DeclareUnicodeCharacter{2212}{\textendash}
\fi

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\def\defaultFont{ptm}
\renewcommand*{\familydefault}{\defaultFont}
\renewcommand\UrlFont{\ignore{Actually do nothing!}}

\definecolor{tableRow1}{RGB}{210,234,241}
\definecolor{gray75}{gray}{0.75}

\definecolor{reportType}{HTML}{013873}
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Define the style of table (optional)
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Define styles
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\renewcommand{\chaptername}{Chapitre}

% Titres selon le guide EMSI : chapitre 16 pt gras, section 14 pt gras,
% sous-section 12 pt gras ; interligne des titres simple (baselineskip du titre).
\titleformat{\chapter}[display]
    {\bfseries\fontsize{16}{20}\selectfont}
    {\filleft\fontsize{14}{18}\selectfont\textcolor{black!65}{\chaptername\ \thechapter}}
    {1ex}
    {\titlerule[0.8pt]\vspace{1.5ex}\filright#1}

\titleformat{name=\chapter, numberless}[display]
    {\bfseries\fontsize{16}{20}\selectfont}
    {}
    {0pt}
    {\titlerule[0.8pt]\vspace{1.5ex}\filright#1}

\titlespacing*{\chapter}{0pt}{0pt}{1cm}

\titleformat{\section}[block]%
    {\bfseries\fontsize{14}{18}\selectfont}{\thesection}%
    {10pt}{#1}

\titleformat{\subsection}[block]%
    {\bfseries\fontsize{12}{16}\selectfont}{\thesubsection}%
    {10pt}{#1}

\titleformat{\subsubsection}[block]%
    {\bfseries\fontsize{12}{16}\selectfont}{\thesubsubsection}%
    {10pt}{#1}

\titleformat{\paragraph}[block]%
    {\normalfont\normalsize\bfseries}%
    {\theparagraph}{1em}{#1}

% 2. Titre de niveau 1 (24 pts avant, 12 après)
% 2.1. Titre de niveau 2 (24 pts avant, 12 après)
% 2.1.1. Titre de niveau 3 (style Inter-3) (12 pts avant, 6 après)
% 2.1.1.1. Titre de niveau 4 (style Inter-4) (12 pts avant, 6 après)

\captionsetup{labelfont=bf,textfont=bf,font={footnotesize,singlespacing},justification=justified}

% Notes de bas de page : 10 pt (guide EMSI)
\renewcommand{\footnotesize}{\fontsize{10}{12}\selectfont}

%%%%%%%%%%%% My style begin :p%%%%%%%%%%%%

\fancypagestyle{MyStyle}{
    \renewcommand{\headrulewidth}{0pt}
    \renewcommand{\footrulewidth}{0.5pt}
    \fancyhead[L]{}
    \fancyfoot[R]{\fontsize{12}{12}\selectfont Page \thepage}% Right footer
    \fancyfoot[L]{\fontsize{12}{12}\selectfont ETTAHIRI Mouad}% Right header
}

\renewcommand{\chaptermark}[1]{\markboth{\MakeUppercase{#1}}{}}

%%%%%%%%%%%% My style end :p%%%%%%%%%%%%

\fancypagestyle{plain}{
    \fancyhf{}% Clear header/footer
    \renewcommand{\headrulewidth}{0.5pt}
    \renewcommand{\footrulewidth}{0.5pt}
    \fancyhead[L]{\fontsize{12}{12}\selectfont\textsc{\MakeLowercase{\leftmark}}}% Left header
    \fancyfoot[R]{\fontsize{12}{12}\selectfont Page \thepage}% Right footer
    \fancyfoot[L]{\fontsize{12}{12}\selectfont\ ETTAHIRI Mouad}% Right header
}

\setlength{\fboxsep}{0mm}%
\setlength{\fboxrule}{1pt}%

% Set the footnote counter to be continuous over the whole document
\counterwithout{footnote}{chapter}
\pagestyle{plain}% Set page style to plain.

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Useful commands
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\newcommand{\ignore}[2]{\hspace{0mm}#2}

\newcommand{\HRule}[1][\linewidth]{%
    % Arg1 : Width      : \linewidth
    \rule{#1}{0.5mm}%
}

\newcommand{\printBigName}{%
    \leavevmode\color{titleColorGray}\setmainfont{Cambria}\fontsize{23pt}{23pt}\selectfont\textbf{\@name}
}

\newcommand{\putPhoto}[1]{%
    \includegraphics[width=35mm, height=35mm]{#1}
    %\tcbincludegraphics[blank,arc=0.4cm]{#1}
}

\newcommand{\highlight}[1]{%
    \textit{#1}%
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Init commands
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\setcounter{secnumdepth}{5}
\setcounter{tocdepth}{3}

\renewcommand\theparagraph{\alph{paragraph})}
\renewcommand\thesubparagraph{\roman{subparagraph}.}

\setlength{\parindent}{0pt} % No paragraph indentation
\setlength{\parskip}{1ex} % Spacing between paragraphs
\setlist[enumerate]{itemsep=-0.35\baselineskip} % Spacing in enumerates

% Hyphenation settings
\hyphenation{ap-pro-vi-sion-ne-ment}
\hyphenpenalty=5000
\exhyphenpenalty=5000
\sloppy

% Remove widow lines
%\clubpenalty=10000
%\widowpenalty=10000
%\brokenpenalty=10000
%\predisplaypenalty=10000
%\postdisplaypenalty=10000
%\displaywidowpenalty=10000

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% New Environments
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% all of the pfe redaction goes here
\NewEnviron{pfe-lycom} {%
    \begingroup%
    \justifying % Add justification for the environment
    \BODY%
    \endgroup%
}
