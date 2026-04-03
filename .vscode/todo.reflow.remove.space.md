I'd expect the blank line after <remarks> to be removed  so if blank line appears simply between 'xml elements', remove them.
Start:

/// <summary><para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals <paramref 
/// name="desiredDay"/> and <paramref name="dateType"/>.</para>
/// <para>How well does this work? It works like a charm. You can find the next or previous occurrence of a day of the week,
/// or the occurrence of a day of the week in the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this method with dateType set to Next and desiredDay set to Tuesday. If you
/// want to find the previous Friday, you can use dateType Previous and desiredDay Friday.</para>
/// 
/// <para>If you want to find the Tuesday in the next week, you can use dateType NextWeek and desiredDay Tuesday. If you want
/// to find the Friday in the previous week, you can use dateType PreviousWeek and desiredDay Friday.</para>
/// </summary>
/// <param name="startDate">The target date.</param>
/// <param name="desiredDay">Monday, Tuesday, ..., Friday representing which day you want.</param>
/// <param name="dateType">Date increment type. PreviousWeek, NextWeek, PreviousDay, NextDay.</param>
/// <returns><paramref name="startDate"/> converted to the first occurrence of desiredDay based on dateType.</returns>
/// <remarks>
/// 
/// <para>NOTE: If <paramref name="startDate"/> DayOfWeek equals <paramref name="desiredDay"/> and paramref name="dateType"/>
/// is Next or Previous, startDate is returned.</para>
/// 
/// <para>If dateType is PreviousWeek or NextWeek, the desiredDay before the previous Sunday or after the next Sunday, respectively, will be returned.</para>
/// <para>If dateType is Previous or Next, the first occurrence of the desiredDay in the appropriate direction will be
/// returned.</para>
/// </remarks>
/// 
/// <example>
/// NOTE: Need encoded angles for tooltip to render properly in native VS Code. Can I type?
/// <code>
/// ConcurrentDictionary&lt;string, Task&lt;JsonDocument>> cache = new();
///
/// JsonDocument document = await cache.GetOrAddAsync("https://example.com", async url =>
/// {
///     string content = await _httpClient.GetStringAsync(url);
///     return JsonDocument.Parse(content);
/// });
/// </code>
/// </example>
/// <seealso cref="FirstOfMonthOrCoincident">Can I have message</seealso>
/// <exception cref="ArgumentOutOfRangeException">Thrown when dateType is not PreviousWeek, NextWeek, Previous, or Next.</exception>
/// <exception cref="ApplicationException">Thrown when desiredDay is not a valid day of the week.</exception>
/// <exception cref="ArgumentException">Thrown when dateType is not a valid value.</exception>

End:

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para> <para>How well does this work? It works like
/// a charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week
/// in the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this
/// method with dateType set to Next and desiredDay set to Tuesday. If you want to find the previous Friday, you can
/// use dateType Previous and desiredDay Friday.</para> <para>If you want to find the Tuesday in the next week, you can
/// use dateType NextWeek and desiredDay Tuesday. If you want to find the Friday in the previous week, you can use
/// dateType PreviousWeek and desiredDay Friday.</para>
/// </summary>
/// <param name="startDate">The target date.</param>
/// <param name="desiredDay">Monday, Tuesday, ..., Friday representing which day you want.</param>
/// <param name="dateType">Date increment type. PreviousWeek, NextWeek, PreviousDay, NextDay.</param>
/// <returns><paramref name="startDate"/> converted to the first occurrence of desiredDay based on dateType.</returns>
/// <remarks>
///
/// <para>NOTE: If <paramref name="startDate"/> DayOfWeek equals <paramref name="desiredDay"/> and paramref name="dateType"/>
/// is Next or Previous, startDate is returned.</para>
/// <para>If dateType is PreviousWeek or NextWeek, the desiredDay before the previous Sunday or after the next Sunday,
/// respectively, will be returned.</para>
/// <para>If dateType is Previous or Next, the first occurrence of the desiredDay in the appropriate direction will be
/// returned.</para>
/// </remarks>
/// <example>
/// NOTE: Need encoded angles for tooltip to render properly in native VS Code. Can I type?
/// <code>
/// ConcurrentDictionary&lt;string, Task&lt;JsonDocument>> cache = new();
///
/// JsonDocument document = await cache.GetOrAddAsync("https://example.com", async url =>
/// {
///     string content = await _httpClient.GetStringAsync(url);
///     return JsonDocument.Parse(content);
/// });
/// </code>
/// </example>
/// <seealso cref="FirstOfMonthOrCoincident">Can I have message</seealso>
/// <exception cref="ArgumentOutOfRangeException">Thrown when dateType is not PreviousWeek, NextWeek, Previous, or Next.</exception>
/// <exception cref="ApplicationException">Thrown when desiredDay is not a valid day of the week.</exception>
/// <exception cref="ArgumentException">Thrown when dateType is not a valid value.</exception>