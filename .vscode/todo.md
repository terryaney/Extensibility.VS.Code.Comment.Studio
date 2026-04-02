- Add a Extension Developers section to readme and make sure to document how to package an installer and other 'how to work with this project' information, available tasks, avail npm scripts, etc.
- Add a references section to bottom of readme
	- https://microsoft.github.io/vscode-codicons/dist/codicon.html
	- https://github.com/madskristensen/CommentsVS
	- https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags
- At some point I told it to remove 'refresh code anchor' b/c the 'scan' and 'refresh' were confusing.  But I saw this in package.json
"kat-comment-studio.refreshAnchors".  What was point of refresh again (vs scan)?  Will it ever be needed?  If we want to keep code around, lets make a future-ideas.md document and document why we might have this 'refresh' and where the code locations are.  Maybe change the title in package to include (OBSOLETE - SEE future-ideas.md) so if I scan package I don't wonder where there is surfacing?

- Review code base and/or plans completed and ensure readme is accurate.  All settings that exist are documents, obsolete ones removed
	- see if removes 'escape' from keyboard since I deleted that or turned off keybindings I think
	- make sure to document the LINK: well with solution relative examples for both workspace files in vs code, sln in vs code, and when you just open a sub folder what happens (or simply accept it will not work)
- Review VS Code readme and document anything that we didn't implement or confirm the items we did
	- i.e. background thread scanning

- Terry
	- Just launch and look at output...seems way too much??
	- Review readme and compare to VS extension
		- Review settings - categories or alpha?  Then do same to package.json
		- Generate a full { } settings section in jsonc for all settings available in my readme?
		- Need to improve readme to explain/list all commands, shortcuts, feature accessibility etc.
	- Open package.json file - look at the problems and ask AI, also change name to match test explorer, KAT - **
	- Remove all diagnostic logging (or at least comment it out)

Make a new .vscode\Plans\06.misc-bugs-features.04.md for Phase 4 (updating other doc headers approrpiately).  This is for XML Comment Editing issues.

1. Do we just remove 'reflow' action until they move out of comment or manually click the menu?  Worried getting this 'right' with could be complex.  Before continuing with plan, let me know your thoughts on this item specifically, and also tell me how often we try to 'auto reflow'.
2. <para> opening elements should ALWAYS start on a new line regardless of previous line length.
3. Reflow should always modify <summary> so that the open and close tags of summary are on their own (helps with the transparent text look) and the content line(s) are on its own line(s).
4. Big xml edit bug.  Below is some of the bad behavior I noticed:

Started with (trimmed for brevity):

/// <summary>
/// Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>. How well does this work? It works like a charm. You
/// can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in the next

Issue 1: I typed <para> before 'Given' and </para> after the dateType paramRef.  Then, I hit enter after closing and after quick flicker, ended up with this:

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para> /// How well does this work? It works like a
/// charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in

Issue 2: Then I deleted the /// in front of /// How and hit enter before How and ended up with following on a new line (didn't delete extra /// - and this seemed broken to never delete extra /// for rest of my debug session, regardless of which line I was breaking on):

/// /// How well does this work? It works like a

If I selected from H backwards back up to the </para> and hit enter again just to try and clean it up, I ended up with Issue 1 result.

Issue 3: I started with following:

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para>
/// How well does this work? It works like a
/// charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in
/// the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this
/// method with dateType set to Next and desiredDay set to Tuesday. If you want to find the previous Friday, you can
/// use dateType Previous and desiredDay Friday. If you want to find the Tuesday in the next week, you can use dateType
/// NextWeek and desiredDay Tuesday. If you want to find the Friday in the previous week, you can use dateType
/// PreviousWeek and desiredDay Friday.
/// </summary>

After I did the following:
1. Typed <para> at start of line 3
2. Backspaced 'charm' (line 4) to end of line 3.
3. Typed </para> after `Friday.` on line 7

I ended up with following and didn't like that it brought starting <para> to line 2 of my comment.

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para> <para>How well does this work? It works like
/// a charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week
/// in the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this
/// method with dateType set to Next and desiredDay set to Tuesday. If you want to find the previous Friday, you can
/// use dateType Previous and desiredDay Friday.</para>If you want to find the Tuesday in the next week, you can use
/// dateType NextWeek and desiredDay Tuesday. If you want to find the Friday in the previous week, you can use dateType
/// PreviousWeek and desiredDay Friday.
/// </summary>
